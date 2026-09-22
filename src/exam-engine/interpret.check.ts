// Dogfood: run the interpreter against every exam in the real config file and print the
// plain-English account. Proves the describe layer is exam-agnostic (IELTS / SE / OET / GRE
// / GMAT) before anything is wired. No DB, no loader.
//   npx tsx src/exam-engine/interpret.check.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { interpretConfig, describeInterpretation } from './interpret';

const cfg = JSON.parse(readFileSync(join(process.cwd(), 'src/exam-engine/exam-engine-config.v2.json'), 'utf8'));

for (const [id, ex] of Object.entries<any>(cfg.exams)) {
  console.log('\n' + '='.repeat(78));
  console.log(`EXAM KEY: ${id}`);
  console.log('='.repeat(78));
  console.log(describeInterpretation(interpretConfig(ex, cfg.scales)));
}
