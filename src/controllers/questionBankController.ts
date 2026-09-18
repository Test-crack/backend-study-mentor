// src/controllers/questionBankController.ts
//
// Superadmin Question-Bank inventory — read-only counts of how many questions
// currently exist per exam, broken down by component (Diagnostics, Daily
// Drills, Internal Assessment, Mock Test) and, within each, by skill →
// sub-skill → level. Lets an admin see at a glance which exam / skill / level
// is thin and needs more authoring.
//
// The four components live in four separate tables with *different* shapes:
//   - DiagnosticQuestion: skill + level (Char), no sub_skill; content lives in sets
//   - DrillQuestion:      skill + sub_skill + level (BEGINNER/INTERMEDIATE/ADVANCED)
//   - IAQuestion:         skill + sub_skill + difficulty (used as the "level")
//   - MockQuestion:       skill + sub_skill (nullable), no level
// We normalise all four into a common { skill, subSkill?, level?, count } row
// and fold them into one uniform tree, so the frontend renders generically and
// adding a new exam needs no code change here (it's data-driven off exam_id).

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

// ─── Stable, human-friendly ordering ────────────────────────────────────────
const SKILL_ORDER = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'];
const SUBSKILL_ORDER = [
    'LISTENING', 'READING', 'GRAMMAR', 'VOCABULARY', 'COHERENCE',
    'TASK_RESPONSE', 'FLUENCY', 'PRONUNCIATION', 'INTERACTION',
];
// Enum-based components (drill/ia). Diagnostic levels are free Char values
// (e.g. "A"/"B"/"C") and fall through to alphabetical.
const LEVEL_ORDER = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

const STATUS_RANK: Record<string, number> = { live: 0, reserved: 1, disabled: 2 };

const UNSPECIFIED = 'UNSPECIFIED';

// ─── Normalised grouped row (one shape for all four component tables) ────────
interface Norm {
    examId: string;
    skill: string;
    subSkill: string | null;
    level: string | null;
    count: number;
}

interface LevelCount { key: string; count: number; }
interface SubSkillNode { key: string; total: number; levels: LevelCount[]; }
interface SkillNode { skill: string; total: number; levels: LevelCount[]; subSkills: SubSkillNode[]; }
interface ComponentBreakdown { total: number; setCount?: number; skills: SkillNode[]; }

/** Comparator that honours an explicit order list, then falls back to alpha. */
function byOrder(order: string[]) {
    return (a: string, b: string): number => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    };
}

const sortLevels = byOrder(LEVEL_ORDER);
const sortSkills = byOrder(SKILL_ORDER);
const sortSubSkills = byOrder(SUBSKILL_ORDER);

function levelsFromMap(m: Map<string, number>): LevelCount[] {
    return [...m.entries()]
        .sort((a, b) => sortLevels(a[0], b[0]))
        .map(([key, count]) => ({ key, count }));
}

/**
 * Fold normalised rows into the uniform skill → sub-skill → level tree.
 * `hasSubSkill` / `hasLevel` say which dimensions this component actually has,
 * so absent dimensions come back as empty arrays rather than noise.
 */
function buildComponent(rows: Norm[], opts: { hasSubSkill: boolean; hasLevel: boolean }): ComponentBreakdown {
    interface SkillAcc { total: number; levels: Map<string, number>; subs: Map<string, { total: number; levels: Map<string, number> }>; }
    const skills = new Map<string, SkillAcc>();
    let total = 0;

    for (const r of rows) {
        total += r.count;
        let s = skills.get(r.skill);
        if (!s) { s = { total: 0, levels: new Map(), subs: new Map() }; skills.set(r.skill, s); }
        s.total += r.count;

        if (opts.hasLevel && r.level != null) {
            s.levels.set(r.level, (s.levels.get(r.level) ?? 0) + r.count);
        }
        if (opts.hasSubSkill) {
            const subKey = r.subSkill ?? UNSPECIFIED;
            let sub = s.subs.get(subKey);
            if (!sub) { sub = { total: 0, levels: new Map() }; s.subs.set(subKey, sub); }
            sub.total += r.count;
            if (opts.hasLevel && r.level != null) {
                sub.levels.set(r.level, (sub.levels.get(r.level) ?? 0) + r.count);
            }
        }
    }

    const skillNodes: SkillNode[] = [...skills.entries()]
        .sort((a, b) => sortSkills(a[0], b[0]))
        .map(([skill, s]) => ({
            skill,
            total: s.total,
            levels: levelsFromMap(s.levels),
            subSkills: [...s.subs.entries()]
                .sort((a, b) => sortSubSkills(a[0], b[0]))
                .map(([key, sub]) => ({ key, total: sub.total, levels: levelsFromMap(sub.levels) })),
        }));

    return { total, skills: skillNodes };
}

function prettifyExamId(id: string): string {
    return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── GET /api/superadmin/question-bank/summary ───────────────────────────────
export async function getQuestionBankSummary(_req: AuthRequest, res: Response) {
    try {
        const [diagRows, diagSets, drillRows, iaRows, mockRows, examTable] = await Promise.all([
            prisma.diagnosticQuestion.groupBy({
                by: ['exam_id', 'skill', 'level'],
                where: { is_active: true },
                _count: { _all: true },
            } as any) as Promise<any[]>,
            prisma.diagnosticQuestion.groupBy({
                by: ['exam_id', 'set_id'],
                where: { is_active: true },
            } as any) as Promise<any[]>,
            prisma.drillQuestion.groupBy({
                by: ['exam_id', 'skill', 'sub_skill', 'level'],
                where: { is_active: true },
                _count: { _all: true },
            } as any) as Promise<any[]>,
            prisma.iAQuestion.groupBy({
                by: ['exam_id', 'skill', 'sub_skill', 'difficulty'],
                where: { is_active: true },
                _count: { _all: true },
            } as any) as Promise<any[]>,
            prisma.mockQuestion.groupBy({
                by: ['exam_id', 'skill', 'sub_skill'],
                where: { is_active: true },
                _count: { _all: true },
            } as any) as Promise<any[]>,
            prisma.exam.findMany({ orderBy: { id: 'asc' } }),
        ]);

        const normDiag: Norm[] = diagRows.map(r => ({ examId: r.exam_id, skill: r.skill, subSkill: null, level: r.level, count: r._count._all }));
        const normDrill: Norm[] = drillRows.map(r => ({ examId: r.exam_id, skill: r.skill, subSkill: r.sub_skill, level: r.level, count: r._count._all }));
        const normIa: Norm[] = iaRows.map(r => ({ examId: r.exam_id, skill: r.skill, subSkill: r.sub_skill, level: r.difficulty, count: r._count._all }));
        const normMock: Norm[] = mockRows.map(r => ({ examId: r.exam_id, skill: r.skill, subSkill: r.sub_skill, level: null, count: r._count._all }));

        // Distinct diagnostic sets per exam — for diagnostics the set count is
        // as meaningful as the row count (content is authored/imported per set).
        const setCountByExam = new Map<string, number>();
        for (const r of diagSets) setCountByExam.set(r.exam_id, (setCountByExam.get(r.exam_id) ?? 0) + 1);

        // Pre-bucket every normalised row by exam so we don't re-scan per exam.
        const rowsByExam = new Map<string, { diag: Norm[]; drill: Norm[]; ia: Norm[]; mock: Norm[] }>();
        const bucket = (id: string) => {
            let b = rowsByExam.get(id);
            if (!b) { b = { diag: [], drill: [], ia: [], mock: [] }; rowsByExam.set(id, b); }
            return b;
        };
        normDiag.forEach(r => bucket(r.examId).diag.push(r));
        normDrill.forEach(r => bucket(r.examId).drill.push(r));
        normIa.forEach(r => bucket(r.examId).ia.push(r));
        normMock.forEach(r => bucket(r.examId).mock.push(r));

        const examMeta = new Map(examTable.map(e => [e.id, { label: e.label, status: e.status }]));

        // Every exam that either exists in the exams table or has any question,
        // so an admin sees registered-but-empty exams (0 questions ⇒ needs authoring).
        const examIds = new Set<string>([...examMeta.keys(), ...rowsByExam.keys()]);

        const orderedExamIds = [...examIds].sort((a, b) => {
            const sa = STATUS_RANK[examMeta.get(a)?.status ?? ''] ?? 3;
            const sb = STATUS_RANK[examMeta.get(b)?.status ?? ''] ?? 3;
            if (sa !== sb) return sa - sb;
            return a.localeCompare(b);
        });

        const exams = orderedExamIds.map(examId => {
            const b = rowsByExam.get(examId) ?? { diag: [], drill: [], ia: [], mock: [] };
            const diagnostic = buildComponent(b.diag, { hasSubSkill: false, hasLevel: true });
            diagnostic.setCount = setCountByExam.get(examId) ?? 0;
            const drill = buildComponent(b.drill, { hasSubSkill: true, hasLevel: true });
            const ia = buildComponent(b.ia, { hasSubSkill: true, hasLevel: true });
            const mock = buildComponent(b.mock, { hasSubSkill: true, hasLevel: false });
            const meta = examMeta.get(examId);

            return {
                examId,
                label: meta?.label ?? prettifyExamId(examId),
                status: meta?.status ?? 'unknown',
                total: diagnostic.total + drill.total + ia.total + mock.total,
                components: { diagnostic, drill, ia, mock },
            };
        });

        return res.json({
            generatedAt: new Date().toISOString(),
            // Self-describing component metadata: the UI reads this to decide
            // which columns (sub-skill / level) to render per component.
            components: [
                { key: 'diagnostic', label: 'Diagnostics', hasSubSkill: false, hasLevel: true, levelLabel: 'Level' },
                { key: 'drill', label: 'Daily Drills', hasSubSkill: true, hasLevel: true, levelLabel: 'Level' },
                { key: 'ia', label: 'Internal Assessment', hasSubSkill: true, hasLevel: true, levelLabel: 'Difficulty' },
                { key: 'mock', label: 'Mock Test', hasSubSkill: true, hasLevel: false, levelLabel: null },
            ],
            exams,
        });
    } catch (err: any) {
        console.error('[QuestionBank] getQuestionBankSummary error:', err);
        return res.status(500).json({ error: err?.message ?? 'Failed to compute question-bank summary' });
    }
}
