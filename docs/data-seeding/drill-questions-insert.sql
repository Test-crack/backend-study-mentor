INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''My phone number is oh-two-oh seven-eight-five three-double-two-one.'' What is the number?', '{"A":"020 785 3221","B":"020 785 3211","C":"020 875 3221","D":"020 785 3222"}'::jsonb, '"A"', '''Oh'' = 0, ''double-two'' = 22, so the number is 020 785 3221.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker A: ''Would you like tea or coffee?'' Speaker B: ''Coffee, please.'' What does Speaker B want?', '{"A":"Tea","B":"Coffee","C":"Both","D":"Neither"}'::jsonb, '"B"', 'Speaker B answers ''coffee, please'', clearly choosing coffee.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''I''ll meet you at the station at quarter to seven.'' What time is the meeting?', '{"A":"6:15","B":"6:45","C":"7:15","D":"7:45"}'::jsonb, '"B"', '''Quarter to seven'' = 15 minutes before 7 = 6:45.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''I live on Park Road, number fifteen.'' Which address?', '{"A":"50 Park Road","B":"15 Park Lane","C":"15 Park Road","D":"5 Park Road"}'::jsonb, '"C"', '''Number fifteen'' on ''Park Road'' is 15 Park Road.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Two words sound similar: SHIP and SHEEP. Which sentence is most likely?', '{"A":"I saw a sheep in the harbour.","B":"I saw a ship in the field.","C":"I saw a ship in the harbour.","D":"I saw a sheep on the moon."}'::jsonb, '"C"', 'Ships are found in harbours; sheep are found in fields. The most contextually likely sentence is C.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Which response best fits ''How are you?''', '{"A":"I''m 25 years old.","B":"Fine, thanks. And you?","C":"I live in Madrid.","D":"Yes, I am."}'::jsonb, '"B"', '''How are you?'' asks about wellbeing; the standard reply is ''fine, thanks'' (often returning the question).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''The price is fifty dollars, not fifteen.'' What is the correct price?', '{"A":"$15","B":"$50","C":"$55","D":"$5"}'::jsonb, '"B"', 'The speaker clarifies fifty (50), not fifteen (15). Distinguishing ''teen'' /tiːn/ from ''ty'' /ti/ numbers is a key listening skill.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''Please open your books at page thirteen.'' Which page?', '{"A":"Page 30","B":"Page 13","C":"Page 3","D":"Page 33"}'::jsonb, '"B"', '''Thirteen'' (with stress on ''-teen'') = 13.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'What is the most likely setting for: ''Could I have the bill, please?''', '{"A":"A library","B":"A restaurant","C":"A school","D":"A hospital"}'::jsonb, '"B"', 'Asking for ''the bill'' is a request to pay, characteristic of restaurants.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''My name is Anna — A-N-N-A.'' How do you spell her name?', '{"A":"ANA","B":"ANNA","C":"ANNAH","D":"HANA"}'::jsonb, '"B"', 'The speaker spells out A-N-N-A, which is ''ANNA''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker A: ''Excuse me, where''s the toilet?'' Speaker B: ''Down the corridor on the right.'' What did A want?', '{"A":"A drink","B":"Directions to the toilet","C":"A taxi","D":"Help with shopping"}'::jsonb, '"B"', 'A is asking for the location of the toilet.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Two words: BAD and BED. Which sentence is most likely?', '{"A":"I sleep in my bad.","B":"I sleep in my bed.","C":"I have a bed cold.","D":"He is a bed boy."}'::jsonb, '"B"', 'You sleep in a ''bed'', not a ''bad''. /æ/ vs /e/ minimal pair.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''The shop closes at half past five.'' What time does it close?', '{"A":"4:30","B":"5:00","C":"5:30","D":"5:50"}'::jsonb, '"C"', '''Half past five'' = 30 minutes after 5 = 5:30.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''I''d like a single room for two nights, please.'' Where is this most likely happening?', '{"A":"At an airport","B":"At a hotel reception","C":"At a bus stop","D":"At a school"}'::jsonb, '"B"', 'Booking a ''single room for two nights'' is typical at a hotel reception.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''Turn left at the traffic lights, then go straight.'' What do you do at the lights?', '{"A":"Turn right","B":"Turn left","C":"Stop","D":"Go back"}'::jsonb, '"B"', '''Turn left'' is the direct instruction.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''My birthday is on the third of June.'' Which date?', '{"A":"1 June","B":"3 June","C":"30 June","D":"3 July"}'::jsonb, '"B"', '''The third of June'' = 3 June.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'What is the speaker probably doing: ''Hello, I''d like to order a large pepperoni pizza.''?', '{"A":"Cooking dinner","B":"Ordering food on the phone","C":"Returning a meal","D":"Going on holiday"}'::jsonb, '"B"', '''I''d like to order'' suggests placing an order, likely by phone for a pizza.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker A: ''Do you have brothers or sisters?'' Speaker B: ''Yes, two brothers.'' How many siblings does B have (mentioned)?', '{"A":"One","B":"Two brothers","C":"Two sisters","D":"None"}'::jsonb, '"B"', 'B says ''two brothers''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Two words: WALK and WORK. Which sentence is most likely?', '{"A":"I walk to the office every day.","B":"I work in the park every Sunday.","C":"I walk on a computer.","D":"I work my dog every morning."}'::jsonb, '"A"', '''Walk to the office'' is the natural collocation. /ɔː/ in ''walk'' vs /ɜː/ in ''work'' — context disambiguates.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'BEGINNER', 'MCQ', 'Speaker: ''I''m sorry, I can''t come to your party on Saturday.'' What is the speaker doing?', '{"A":"Accepting an invitation","B":"Refusing politely","C":"Inviting someone","D":"Asking a question"}'::jsonb, '"B"', '''I''m sorry, I can''t come'' is a polite refusal/declining of an invitation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''The conference will be held from the fifteenth to the eighteenth of March, inclusive.'' How many days does it last?', '{"A":"Two days","B":"Three days","C":"Four days","D":"Five days"}'::jsonb, '"C"', '''From the 15th to the 18th, inclusive'' covers 15, 16, 17, 18 = 4 days.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker A: ''The total comes to £49.99.'' Speaker B: ''Here''s £50.'' What change should A give?', '{"A":"1p","B":"10p","C":"£1","D":"Nothing"}'::jsonb, '"A"', '£50.00 minus £49.99 = £0.01 = 1 pence.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''I''d rather not say.'' This phrase usually indicates the speaker:', '{"A":"Is happy to share details","B":"Prefers to keep something private","C":"Wants you to repeat the question","D":"Doesn''t understand"}'::jsonb, '"B"', '''I''d rather not say'' is a polite way to decline answering — the speaker wants to keep the matter private.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''Sorry, could you repeat that? The line''s a bit unclear.'' Where is the conversation taking place?', '{"A":"Face-to-face in a quiet room","B":"On a phone call","C":"In writing","D":"On stage"}'::jsonb, '"B"', '''The line''s a bit unclear'' refers to a phone connection problem.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Lecturer: ''Today we''re going to look briefly at three aspects: causes, effects, and possible solutions.'' How many aspects will be covered?', '{"A":"One","B":"Two","C":"Three","D":"Four"}'::jsonb, '"C"', 'The lecturer explicitly lists three aspects: causes, effects, and solutions.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker A: ''I don''t suppose you could lend me your notes?'' What is A doing?', '{"A":"Confidently demanding the notes","B":"Politely and tentatively requesting the notes","C":"Refusing to share notes","D":"Offering notes to B"}'::jsonb, '"B"', '''I don''t suppose you could…'' is a tentative, polite request, often used when the speaker thinks the answer might be ''no''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''The flight has been delayed by approximately two hours.'' What does ''approximately'' mean?', '{"A":"Exactly","B":"About / roughly","C":"More than","D":"Less than"}'::jsonb, '"B"', '''Approximately'' means about or roughly — not exact.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''I''ll get back to you on that.'' This usually means:', '{"A":"I will answer right now.","B":"I will respond later.","C":"I refuse to discuss it.","D":"I don''t know what you mean."}'::jsonb, '"B"', '''I''ll get back to you'' is a common phrase meaning the speaker will reply later, after thinking or finding information.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''It''s not that I don''t like the idea — I just have some reservations.'' What does the speaker feel?', '{"A":"Strong enthusiasm","B":"Some doubts despite not opposing the idea","C":"Total opposition","D":"Indifference"}'::jsonb, '"B"', '''Have some reservations'' means having doubts or concerns; the speaker doesn''t reject it but isn''t fully convinced.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Lecturer: ''Make sure you submit your assignments by Friday — and I do mean Friday.'' The repeated emphasis suggests:', '{"A":"The deadline is flexible.","B":"The deadline is strict and will not be extended.","C":"Friday is optional.","D":"There is no deadline."}'::jsonb, '"B"', '''I do mean'' (with emphasis) underlines that the deadline is firm and not negotiable.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker A: ''Did you enjoy the film?'' Speaker B: ''Well, it was… interesting.'' How does B feel about the film?', '{"A":"Definitely loved it","B":"Hesitant — possibly unimpressed but being polite","C":"Hated it openly","D":"Hasn''t seen it"}'::jsonb, '"B"', 'The pause and the vague word ''interesting'' typically indicate polite reservation rather than genuine enthusiasm.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''Two single tickets to Manchester, please.'' What is the speaker buying?', '{"A":"One return ticket","B":"Two one-way tickets","C":"Two return tickets","D":"A monthly pass"}'::jsonb, '"B"', '''Single'' tickets are one-way (in British usage); the speaker wants two of them.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''Whatever you think is best.'' The tone of this response is:', '{"A":"Decisive","B":"Deferential — leaving the decision to the listener","C":"Aggressive","D":"Confused"}'::jsonb, '"B"', 'The speaker is deferring — handing the decision to the other person.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Lecturer: ''Last week we covered demand. Today, we''ll move on to supply.'' What is the topic of today''s lecture?', '{"A":"Demand","B":"Supply","C":"Both demand and supply equally","D":"Neither"}'::jsonb, '"B"', '''Today, we''ll move on to supply'' indicates supply is the new focus.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker A: ''I assume you''ll be coming to the meeting?'' Speaker B: ''Actually, no — I have a prior commitment.'' What does ''actually'' signal?', '{"A":"Agreement with A","B":"A polite contradiction of A''s assumption","C":"Confusion","D":"Sarcasm"}'::jsonb, '"B"', '''Actually'' is often used to politely contradict an assumption or expectation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''The discount is twenty per cent off the original price of £80.'' What is the discounted price?', '{"A":"£60","B":"£64","C":"£72","D":"£100"}'::jsonb, '"B"', '20% of £80 = £16; £80 - £16 = £64.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''You might want to bring an umbrella.'' This is best understood as:', '{"A":"An order","B":"A polite suggestion / advice","C":"A question","D":"A complaint"}'::jsonb, '"B"', '''You might want to…'' is a softened, polite way of giving advice.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker A: ''How long does the journey take?'' Speaker B: ''Anywhere between forty minutes and an hour.'' What is B saying?', '{"A":"Exactly 40 minutes","B":"Exactly 1 hour","C":"Somewhere in the range 40–60 minutes","D":"More than 2 hours"}'::jsonb, '"C"', '''Anywhere between X and Y'' indicates a range — 40 minutes to 60 minutes (1 hour).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Speaker: ''I''d love to come — unfortunately, I can''t.'' What is the speaker doing?', '{"A":"Accepting an invitation enthusiastically","B":"Politely declining while showing regret","C":"Asking for more information","D":"Inviting someone else"}'::jsonb, '"B"', '''I''d love to … unfortunately, I can''t'' is a polite refusal expressing genuine regret.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'INTERMEDIATE', 'MCQ', 'Lecturer: ''Although the data appears compelling, we should not jump to conclusions.'' What is the lecturer urging?', '{"A":"Immediate acceptance of the data","B":"Cautious, careful interpretation","C":"Rejection of the data","D":"Ignoring the topic"}'::jsonb, '"B"', '''We should not jump to conclusions'' means we must not rush — i.e., interpret cautiously.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Lecturer: ''It would be a mistake, however, to view these phenomena in isolation; they are, in fact, deeply interconnected.'' What is the lecturer''s main point?', '{"A":"The phenomena are entirely independent.","B":"The phenomena should be examined together because they are linked.","C":"The phenomena cannot be studied at all.","D":"The phenomena are not worth studying."}'::jsonb, '"B"', '''Mistake to view them in isolation … deeply interconnected'' urges studying them together as linked phenomena.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Speaker: ''I''m afraid I''m going to have to disagree with you on that point.'' What is the speaker doing?', '{"A":"Apologising for being late","B":"Politely but firmly disagreeing","C":"Strongly agreeing","D":"Asking for clarification"}'::jsonb, '"B"', '''I''m afraid I''m going to have to…'' is a polite but firm formula introducing disagreement.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Lecturer: ''The findings are striking, albeit somewhat preliminary.'' What does ''albeit'' indicate?', '{"A":"An equivalent term to ''because''","B":"A concession — ''although''","C":"A reason","D":"A consequence"}'::jsonb, '"B"', '''Albeit'' = although; it concedes that the findings are preliminary while still calling them striking.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Speaker A: ''Are you on board with the plan?'' Speaker B: ''In principle, yes — though I do have some concerns.'' What is B''s position?', '{"A":"Total enthusiasm","B":"Conditional/qualified support","C":"Outright rejection","D":"Confusion"}'::jsonb, '"B"', '''In principle, yes'' = agreement on the general idea; ''though I do have concerns'' qualifies that agreement.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Lecturer: ''One must be wary of conflating correlation with causation.'' What is the warning?', '{"A":"Correlation always implies causation.","B":"Don''t mistakenly treat a correlation as proof of cause.","C":"Causation always exists in correlations.","D":"Statistics are useless."}'::jsonb, '"B"', '''Wary of conflating'' means caution against treating two different things — correlation and causation — as the same.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Speaker: ''With all due respect, I think you''ve misunderstood the question.'' The phrase ''with all due respect'' typically signals:', '{"A":"Strong agreement","B":"Polite contradiction or criticism","C":"Indifference","D":"Deep admiration"}'::jsonb, '"B"', 'Despite literal politeness, ''with all due respect'' usually precedes disagreement or criticism in formal speech.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Lecturer: ''The remedy proposed is, at best, a stopgap measure.'' What is the lecturer''s view of the remedy?', '{"A":"An optimal long-term solution","B":"A temporary fix that doesn''t fully address the problem","C":"A complete failure","D":"An irrelevant proposal"}'::jsonb, '"B"', '''At best, a stopgap'' = even on the most generous reading, it''s only a temporary fix — implying it''s inadequate.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Speaker: ''I wouldn''t go so far as to say it''s revolutionary, but it certainly represents a meaningful step forward.'' What is the speaker''s view?', '{"A":"It''s revolutionary.","B":"It''s worthless.","C":"Significant but not transformative.","D":"Identical to existing approaches."}'::jsonb, '"C"', '''I wouldn''t go so far as to say revolutionary'' rejects the strongest claim; ''meaningful step forward'' affirms genuine, but not transformative, progress.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Lecturer: ''Insofar as the data permits a conclusion, it suggests a modest positive effect.'' What is the speaker conveying?', '{"A":"The data definitively proves a large effect.","B":"The data is insufficient and shows no effect.","C":"Within the limits of the data, there is a small positive effect.","D":"The data shows a negative effect."}'::jsonb, '"C"', '''Insofar as the data permits'' = within the limits of what the data can show; ''modest positive effect'' = a small but real positive result.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Speaker: ''I''ll grant you that the implementation has been flawed, but the underlying principle remains sound.'' What is the speaker conceding?', '{"A":"The principle is wrong.","B":"The implementation is fine.","C":"Only that the implementation has problems, while defending the principle.","D":"Everything about the policy."}'::jsonb, '"C"', '''I''ll grant you'' concedes only the specific point (flawed implementation); ''but the underlying principle remains sound'' defends the principle.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Lecturer: ''The argument, while ostensibly compelling, founders on closer scrutiny.'' What is the lecturer''s stance?', '{"A":"The argument is genuinely strong.","B":"The argument seems strong but breaks down upon detailed examination.","C":"The argument has not been examined.","D":"The argument is purely emotional."}'::jsonb, '"B"', '''Ostensibly compelling'' = appears compelling; ''founders on closer scrutiny'' = falls apart when examined more carefully.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Speaker: ''Far be it from me to suggest you''re wrong, but…'' What follows is most likely:', '{"A":"An expression of strong agreement","B":"A direct compliment","C":"A polite contradiction or criticism","D":"A change of topic"}'::jsonb, '"C"', '''Far be it from me to…'' is an ironic disclaimer — the speaker is about to do exactly what they claim not to do (suggest the listener is wrong).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Lecturer: ''Suffice it to say, the implications extend well beyond the immediate context.'' What does this phrase signal?', '{"A":"The lecturer will give exhaustive detail.","B":"The lecturer is giving a summary statement without elaborating.","C":"The implications are trivial.","D":"The topic is closed."}'::jsonb, '"B"', '''Suffice it to say'' is used to make a brief summarising statement, signalling the speaker is not going to elaborate further on the point.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Speaker A: ''Can I count on your support?'' Speaker B: ''Let me sleep on it.'' What is B doing?', '{"A":"Refusing outright","B":"Agreeing immediately","C":"Asking to delay the decision until they''ve considered it","D":"Misunderstanding the question"}'::jsonb, '"C"', '''Sleep on it'' is an idiom meaning to take time (typically overnight) before deciding.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Lecturer: ''There is, to my mind, no compelling reason to abandon the existing framework.'' What is the lecturer''s view?', '{"A":"We should abandon the framework.","B":"Personally, the lecturer sees no good reason to discard the current framework.","C":"The framework is universally accepted.","D":"The framework is irrelevant."}'::jsonb, '"B"', '''To my mind'' = in my opinion; ''no compelling reason to abandon'' = should keep the framework.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Speaker: ''It''s not entirely without merit, but it''s hardly the breakthrough some have claimed.'' What is the speaker''s view?', '{"A":"Worthless and overhyped","B":"Has some value but is overstated as a breakthrough","C":"A genuine breakthrough","D":"Identical to previous work"}'::jsonb, '"B"', '''Not entirely without merit'' = some value (litotes); ''hardly the breakthrough some have claimed'' = exaggerated claim.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Lecturer: ''Be that as it may, the broader question remains unresolved.'' What does ''be that as it may'' indicate?', '{"A":"Acceptance of the previous point but moving past it","B":"Total agreement with what came before","C":"A request for clarification","D":"The end of the lecture"}'::jsonb, '"A"', '''Be that as it may'' is a concessive phrase: it acknowledges a previous point but signals that the speaker is moving on regardless.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Speaker: ''I''m inclined to think it''s more nuanced than that.'' What is the speaker indicating?', '{"A":"Strong disagreement","B":"A gentle suggestion that the issue is more complex than presented","C":"Total agreement","D":"Confusion about the topic"}'::jsonb, '"B"', '''I''m inclined to think'' is a hedge for personal opinion; ''more nuanced'' suggests the issue has more subtlety than the previous speaker allowed.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Lecturer: ''The evidence, taken in aggregate, lends considerable weight to the hypothesis.'' What does ''taken in aggregate'' mean?', '{"A":"Selectively chosen","B":"Considered as a whole / collectively","C":"Considered piece by piece","D":"Ignored"}'::jsonb, '"B"', '''In aggregate'' means taken together as a whole — collectively, all the evidence supports the hypothesis.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('LISTENING', 'LISTENING', 'ADVANCED', 'MCQ', 'Speaker: ''I''ll level with you — this isn''t going to be straightforward.'' What is the speaker doing?', '{"A":"Lying","B":"Speaking frankly / honestly","C":"Joking","D":"Asking a question"}'::jsonb, '"B"', '''Level with you'' is an idiom meaning to speak frankly and honestly, often before delivering difficult news.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''Maria works in a hospital. She helps doctors look after sick people.'' What is Maria''s job?', '{"A":"Doctor","B":"Nurse","C":"Teacher","D":"Cleaner"}'::jsonb, '"B"', 'Someone who works in a hospital and helps doctors care for sick people is a nurse. Doctor is wrong because she ''helps'' them.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''The library opens at 9 a.m. on weekdays and closes at 6 p.m. On weekends it is closed.'' On Saturday, the library is:', '{"A":"Open from 9 to 6","B":"Open from 9 to 12","C":"Closed","D":"Open all day"}'::jsonb, '"C"', 'Saturday is a weekend, and the text states the library is closed on weekends.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''Dogs need food, water, and exercise every day. They also like company.'' Which is NOT mentioned as a need?', '{"A":"Food","B":"Water","C":"Toys","D":"Exercise"}'::jsonb, '"C"', 'The passage lists food, water, exercise, and company. Toys are not mentioned.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''Tom usually walks to school, but when it rains he takes the bus.'' How does Tom get to school today if it is sunny?', '{"A":"By bus","B":"By car","C":"On foot","D":"By bicycle"}'::jsonb, '"C"', 'He walks to school usually; he only takes the bus when it rains. Sunny weather → he walks.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'In the sentence ''The cake was delicious'', the word ''delicious'' means:', '{"A":"Very large","B":"Tasting very good","C":"Very expensive","D":"Very old"}'::jsonb, '"B"', '''Delicious'' describes food that tastes very good or pleasant.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''Pandas live in China. They eat bamboo. They are very rare.'' Which sentence is TRUE?', '{"A":"Pandas eat fish.","B":"Pandas are common.","C":"Pandas live in Japan.","D":"Pandas live in China."}'::jsonb, '"D"', 'The first sentence directly says pandas live in China. The other options contradict the passage.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''Anna has two cats. They are called Milo and Luna.'' Who is ''They'' in the second sentence?', '{"A":"Anna","B":"Anna and a friend","C":"The two cats","D":"Other people"}'::jsonb, '"C"', '''They'' refers back to the cats mentioned in the previous sentence.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''The supermarket sells fruit, vegetables, bread, and milk, but not meat.'' What does the supermarket NOT sell?', '{"A":"Bread","B":"Milk","C":"Meat","D":"Fruit"}'::jsonb, '"C"', 'The text explicitly says ''but not meat''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''The film starts at 7 p.m. and lasts two hours.'' What time does the film finish?', '{"A":"5 p.m.","B":"7 p.m.","C":"9 p.m.","D":"10 p.m."}'::jsonb, '"C"', 'Starting at 7 p.m. and lasting two hours means it ends at 9 p.m.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'In ''The weather was bad, so we stayed at home'', the word ''so'' shows:', '{"A":"A reason","B":"A result","C":"A contrast","D":"A time"}'::jsonb, '"B"', '''So'' introduces the result of the bad weather — staying at home.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''In summer, the days are long and warm. In winter, the days are short and cold.'' Which season has long days?', '{"A":"Summer","B":"Winter","C":"Spring","D":"Autumn"}'::jsonb, '"A"', 'The text directly states summer days are long; winter days are short.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''Lisa is from France. She speaks French and English.'' Which language is Lisa''s first language likely to be?', '{"A":"English","B":"French","C":"Spanish","D":"German"}'::jsonb, '"B"', 'She is from France, so French is most likely her native language.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''Honey is sweet and golden. Bees make it from flowers.'' What makes honey?', '{"A":"Flowers","B":"Trees","C":"Bees","D":"People"}'::jsonb, '"C"', 'The passage says ''Bees make it''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''Take this medicine three times a day after meals.'' How many times should you take the medicine each day?', '{"A":"Once","B":"Twice","C":"Three times","D":"Four times"}'::jsonb, '"C"', 'The instruction is ''three times a day''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'In the sentence ''The boy was tired because he ran a long way'', why was the boy tired?', '{"A":"He was hungry","B":"He was sad","C":"He ran a long way","D":"He went to bed late"}'::jsonb, '"C"', '''Because he ran a long way'' explains the reason directly.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''Please do not use mobile phones in the cinema.'' What does the sign tell people?', '{"A":"Use phones quietly","B":"Phones are allowed","C":"Don''t use phones here","D":"Buy a phone"}'::jsonb, '"C"', '''Please do not use'' is a clear request not to use phones in the cinema.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'In ''Although it was raining, we went for a walk'', the word ''although'' shows:', '{"A":"An expected result","B":"A surprising contrast","C":"A time","D":"A reason"}'::jsonb, '"B"', '''Although'' introduces a surprising contrast — going for a walk is unexpected when it''s raining.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''My grandfather is 75 years old, but he still plays tennis.'' What does ''but'' suggest about playing tennis at 75?', '{"A":"It is normal","B":"It is unexpected","C":"It is dangerous","D":"It is forbidden"}'::jsonb, '"B"', 'The use of ''but'' suggests playing tennis at his age is somewhat surprising.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''Jack lost his keys. He looked everywhere but couldn''t find them.'' What happened to Jack''s keys?', '{"A":"He found them","B":"Someone took them","C":"He couldn''t find them","D":"He gave them away"}'::jsonb, '"C"', 'The passage says he ''couldn''t find them'' after looking everywhere.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'BEGINNER', 'MCQ', 'Read: ''The book has 300 pages. I have read 150 pages so far.'' How much of the book has been read?', '{"A":"All of it","B":"Half of it","C":"A quarter","D":"None of it"}'::jsonb, '"B"', '150 out of 300 pages is exactly half of the book.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''Despite the heavy traffic, we managed to arrive at the airport on time.'' What does the sentence imply?', '{"A":"We arrived late.","B":"Traffic was light.","C":"We arrived on time, although traffic was bad.","D":"We missed the flight."}'::jsonb, '"C"', '''Despite'' introduces an obstacle — heavy traffic — that did not prevent the on-time arrival.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''Studies suggest that regular exercise can significantly reduce the risk of heart disease.'' The word ''significantly'' is closest in meaning to:', '{"A":"Slightly","B":"Considerably","C":"Briefly","D":"Rarely"}'::jsonb, '"B"', '''Significantly'' means in a way that is large enough to matter — i.e., considerably.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''Renewable energy sources, such as solar and wind power, are becoming increasingly competitive with fossil fuels.'' What is the writer''s main point?', '{"A":"Fossil fuels are cheap.","B":"Renewables are gaining ground against fossil fuels.","C":"Solar power is dangerous.","D":"Wind power has failed."}'::jsonb, '"B"', '''Becoming increasingly competitive'' means renewables are catching up with — gaining ground on — fossil fuels.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''While most students passed the exam, a small minority struggled with the final section.'' Which is TRUE?', '{"A":"All students passed.","B":"All students failed.","C":"Most passed; a few had difficulty with the final section.","D":"The exam had no final section."}'::jsonb, '"C"', 'The sentence contrasts the majority passing with a minority struggling specifically with the final section.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''The new policy aims to curb pollution by introducing stricter emission standards.'' The word ''curb'' means:', '{"A":"Increase","B":"Restrict / reduce","C":"Ignore","D":"Measure"}'::jsonb, '"B"', 'To ''curb'' something is to limit or restrict it.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''Although the company reported record profits, employees received only modest pay increases.'' What can be inferred?', '{"A":"Profits and pay increases matched.","B":"Pay increases were larger than profits.","C":"There is a gap between company profits and employee compensation.","D":"Employees were dismissed."}'::jsonb, '"C"', 'The contrast ''although'' between record profits and only modest pay rises suggests an imbalance/gap.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''The introduction of mandatory recycling has dramatically reduced the volume of household waste sent to landfills.'' What was the effect of mandatory recycling?', '{"A":"It increased landfill use.","B":"It had no effect.","C":"It greatly reduced household waste going to landfills.","D":"It eliminated landfills entirely."}'::jsonb, '"C"', '''Dramatically reduced'' indicates a large decrease.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''Critics argue that the museum''s renovations have stripped it of its historical character.'' What is the critics'' opinion?', '{"A":"The renovations preserved the museum''s history.","B":"The renovations removed the museum''s historical feel.","C":"The renovations were unnecessary but harmless.","D":"The museum was already too modern."}'::jsonb, '"B"', '''Stripped it of its historical character'' means the renovations removed what made it historically distinctive.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''The diet, which excludes all animal products, is known as veganism.'' The relative clause provides:', '{"A":"A reason","B":"A result","C":"A definition / additional information","D":"A contrast"}'::jsonb, '"C"', 'Non-defining relative clauses (''which excludes all animal products'') give extra information defining or describing the noun.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''Unlike his predecessors, the new manager prioritises long-term growth over short-term profit.'' What does this tell us about the previous managers?', '{"A":"They focused on long-term growth.","B":"They focused on short-term profit.","C":"They had no priorities.","D":"They left voluntarily."}'::jsonb, '"B"', '''Unlike his predecessors'' implies the previous managers did the opposite — focused on short-term profit.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''The findings, while preliminary, suggest a strong correlation between sleep quality and academic performance.'' What is the writer''s stance?', '{"A":"The results are conclusive.","B":"The results are early-stage but promising.","C":"The study failed.","D":"Sleep has no effect on grades."}'::jsonb, '"B"', '''Preliminary'' means early/initial; ''strong correlation'' indicates promising findings — but caution is implied.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'In the sentence ''Such measures, however, are unlikely to solve the problem entirely'', the word ''however'' indicates:', '{"A":"Agreement with the previous idea","B":"A contrast or limitation","C":"An example","D":"A summary"}'::jsonb, '"B"', '''However'' signals a contrast — here, a limitation on the effectiveness of the measures previously mentioned.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''Children who read regularly tend to develop stronger vocabulary skills than those who do not.'' Which best summarises the claim?', '{"A":"Reading guarantees a strong vocabulary.","B":"Frequent reading is associated with better vocabulary.","C":"Reading has no effect on vocabulary.","D":"Children who read often struggle with vocabulary."}'::jsonb, '"B"', '''Tend to develop'' suggests an association/tendency — not a guarantee.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''The proposal was met with fierce opposition from local residents.'' The phrase ''fierce opposition'' suggests:', '{"A":"Mild disagreement","B":"Strong, intense resistance","C":"Quiet acceptance","D":"Indifference"}'::jsonb, '"B"', '''Fierce'' intensifies ''opposition'', conveying strong, intense resistance.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''The drug shows promise, but further trials are needed before it can be widely prescribed.'' What is the writer''s view?', '{"A":"The drug should be banned.","B":"The drug is fully approved.","C":"The drug is encouraging but not yet ready for general use.","D":"The drug has no effect."}'::jsonb, '"C"', '''Shows promise'' = encouraging; ''further trials are needed'' = not yet ready for general use.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''The two cities, separated by only fifty kilometres, have remarkably different climates.'' Which is true?', '{"A":"The cities are far apart but similar.","B":"The cities are close together but climatically different.","C":"The cities are far apart and different.","D":"The cities have the same climate."}'::jsonb, '"B"', '''Only fifty kilometres'' = close; ''remarkably different climates'' = different climates.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'In the sentence ''These results, if confirmed, would revolutionise the field'', what does ''if confirmed'' suggest?', '{"A":"The results are certainly true.","B":"The results may not yet be verified.","C":"The field has been revolutionised.","D":"The results are wrong."}'::jsonb, '"B"', '''If confirmed'' is a conditional — implying verification has not yet occurred.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''Tourists are drawn to the island for its pristine beaches and crystal-clear waters.'' What does ''pristine'' most likely mean?', '{"A":"Crowded","B":"Polluted","C":"Untouched / very clean","D":"Dangerous"}'::jsonb, '"C"', '''Pristine'' describes something that is in its original, untouched, very clean condition.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''The author argues that technology, far from improving communication, has actually made meaningful conversation rarer.'' What is the author''s view?', '{"A":"Technology has improved communication.","B":"Technology has had no effect on communication.","C":"Technology has reduced meaningful communication.","D":"Technology will improve in the future."}'::jsonb, '"C"', '''Far from improving … has actually made … rarer'' clearly states technology has reduced meaningful communication, in the author''s view.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'INTERMEDIATE', 'MCQ', 'Read: ''Although well-intentioned, the law has had unintended consequences.'' What does ''unintended consequences'' imply?', '{"A":"Planned outcomes","B":"Results that were not expected or wanted","C":"Results that were predicted accurately","D":"No outcomes at all"}'::jsonb, '"B"', '''Unintended consequences'' are effects not planned or foreseen — usually with a negative implication here.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''The proliferation of mobile devices has, paradoxically, both expanded and constricted our cognitive horizons.'' Which best paraphrases the writer''s claim?', '{"A":"Mobile devices have only positive cognitive effects.","B":"Mobile devices simultaneously broaden and narrow our thinking.","C":"Mobile devices have no cognitive effects.","D":"Cognitive horizons have remained unchanged."}'::jsonb, '"B"', '''Paradoxically … both expanded and constricted'' captures the dual, contradictory effects on cognition.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''The findings call into question long-standing assumptions about the linearity of memory consolidation.'' What is implied?', '{"A":"The findings confirm previous theories.","B":"Memory is now considered fully understood.","C":"Established beliefs about memory may be incorrect.","D":"Memory does not consolidate."}'::jsonb, '"C"', '''Call into question long-standing assumptions'' indicates that established beliefs are being challenged.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'In the passage ''Critics decry the policy as draconian; proponents counter that it is merely commensurate with the gravity of the threat'', the writer:', '{"A":"Sides with the critics.","B":"Sides with the proponents.","C":"Presents both views without explicit endorsement.","D":"Concludes the policy was rescinded."}'::jsonb, '"C"', 'The writer simply presents the opposing positions without endorsing either side, using ''critics … proponents''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''Far from being a mere ornament, rhetoric was, for the ancients, the very foundation of civic life.'' The phrase ''far from being'' is used to:', '{"A":"Confirm a popular view","B":"Reject and reverse a presumed view","C":"Introduce an example","D":"Conclude an argument"}'::jsonb, '"B"', '''Far from being X, it was Y'' is a rhetorical structure that rejects a presumed view (X) and asserts the opposite (Y).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''The author concedes that early evidence was equivocal but maintains that subsequent studies have firmly established the link.'' Which best describes the author''s overall position?', '{"A":"The link has never been established.","B":"The link is now well-established despite earlier ambiguity.","C":"Both early and later evidence is unclear.","D":"Later studies disproved the link."}'::jsonb, '"B"', '''Concedes'' acknowledges early ambiguity, but ''maintains … firmly established'' asserts the link is now solid.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'In an academic passage, the phrase ''It is tempting to conclude … however, such a conclusion would be premature'' signals:', '{"A":"Endorsement of the conclusion","B":"Cautious skepticism toward an obvious-seeming conclusion","C":"Complete dismissal of the conclusion","D":"Confusion on the writer''s part"}'::jsonb, '"B"', 'The writer acknowledges the appeal of the conclusion but warns against accepting it without further evidence — cautious skepticism.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''The novelist''s prose, while ostensibly straightforward, is suffused with subtle ironies that reward careful re-reading.'' What does the writer suggest about the prose?', '{"A":"It is dense and difficult.","B":"It appears simple but contains hidden complexity.","C":"It is openly ironic and obvious.","D":"It does not reward careful reading."}'::jsonb, '"B"', '''Ostensibly straightforward'' means seemingly simple; ''suffused with subtle ironies'' indicates underlying complexity.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''Although correlations are robust, causal mechanisms remain elusive.'' The author implies that:', '{"A":"The cause is well-understood.","B":"Strong patterns exist, but the underlying cause is not yet known.","C":"There is no relationship between the variables.","D":"Correlations are weak."}'::jsonb, '"B"', '''Robust correlations'' = strong patterns; ''causal mechanisms remain elusive'' = the cause hasn''t been pinned down.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''The reform, hailed in some quarters as long overdue and in others as recklessly precipitous, has divided opinion sharply.'' Which conclusion is best supported?', '{"A":"Everyone supports the reform.","B":"Everyone opposes the reform.","C":"Opinion on the reform is polarised.","D":"The reform was never enacted."}'::jsonb, '"C"', '''Hailed in some quarters … in others'' and ''divided opinion sharply'' indicates polarisation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'In ''Whatever its merits, the proposal is unlikely to gain political traction'', the phrase ''whatever its merits'' acknowledges:', '{"A":"The proposal has no merit.","B":"The proposal may have value, but this is set aside.","C":"The proposal will succeed.","D":"The writer enthusiastically supports the proposal."}'::jsonb, '"B"', '''Whatever its merits'' is a concessive phrase: it allows that the proposal may have merit, but the writer sets that aside to focus on its political prospects.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''Such studies, replete with methodological flaws, ought to be treated with considerable circumspection.'' The writer''s attitude toward the studies is:', '{"A":"Enthusiastic","B":"Cautious / skeptical","C":"Indifferent","D":"Wholly accepting"}'::jsonb, '"B"', '''Replete with methodological flaws'' and ''treated with considerable circumspection'' (great caution) signal skepticism.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''The conclusion is plausible inasmuch as it accords with the available data; nevertheless, alternative interpretations cannot be discounted.'' Which paraphrases the writer''s view?', '{"A":"The conclusion is the only possible interpretation.","B":"The conclusion is reasonable but not the only possibility.","C":"The conclusion contradicts the data.","D":"There is no data."}'::jsonb, '"B"', '''Plausible inasmuch as it accords with the data'' = reasonable; ''alternative interpretations cannot be discounted'' = other possibilities remain.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'In ''The reforms succeeded in spite of, rather than because of, the government''s stated objectives'', the writer suggests:', '{"A":"The government''s objectives directly caused success.","B":"Success occurred despite, not as a result of, the government''s stated aims.","C":"The reforms failed.","D":"There were no objectives."}'::jsonb, '"B"', '''In spite of, rather than because of'' draws a sharp distinction: success was not caused by — and even occurred despite — the stated objectives.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''The author''s argument hinges on a contested assumption: that markets, left to their own devices, tend toward equilibrium.'' What does ''hinges on'' mean here?', '{"A":"Contradicts","B":"Depends on / is anchored by","C":"Disproves","D":"Avoids"}'::jsonb, '"B"', '''Hinges on'' means the argument depends on or is anchored by the stated assumption.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''It would be misleading to suggest that the trend is universal; nonetheless, its prevalence in industrialised nations is undeniable.'' What is the writer''s nuanced position?', '{"A":"The trend exists everywhere equally.","B":"The trend exists nowhere.","C":"The trend is not universal but is clearly common in industrialised nations.","D":"The trend is unimportant."}'::jsonb, '"C"', 'The writer rejects universality but affirms prevalence in industrialised nations — a hedged, nuanced claim.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''Posterity, it seems, will be the ultimate arbiter of his legacy.'' The writer implies:', '{"A":"His legacy is already decided.","B":"Future generations, not present judgements, will determine his standing.","C":"He has no legacy.","D":"The legacy is irrelevant."}'::jsonb, '"B"', '''Posterity will be the ultimate arbiter'' = future generations will decide; ''arbiter'' = judge/decider.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''The minister''s response was characterised by a studied ambiguity that left both supporters and detractors claiming vindication.'' What does ''studied ambiguity'' suggest?', '{"A":"Accidental confusion","B":"Deliberately calculated vagueness","C":"Clear, decisive language","D":"Heartfelt sincerity"}'::jsonb, '"B"', '''Studied'' here means deliberate/calculated; ''ambiguity'' means deliberate vagueness — both sides could read it as supporting their view.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'In ''The notion that progress is inexorable has, in recent decades, been subjected to searching critique'', the writer indicates:', '{"A":"Progress is widely seen as unstoppable and uncontested.","B":"The idea that progress is unstoppable has been deeply questioned recently.","C":"Progress has stopped.","D":"Critique has been forbidden."}'::jsonb, '"B"', '''Searching critique'' = thorough, probing examination; the once-accepted notion of inexorable progress has been seriously questioned.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''Few would dispute that the policy has yielded benefits; what remains contentious is whether those benefits justify the substantial costs incurred.'' What is the central debate?', '{"A":"Whether the policy has benefits at all.","B":"Whether the benefits outweigh the costs.","C":"Whether costs were incurred.","D":"Whether the policy existed."}'::jsonb, '"B"', 'Benefits are conceded; the debate is whether they ''justify the substantial costs'' — i.e. cost-benefit balance.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('READING', 'READING', 'ADVANCED', 'MCQ', 'Read: ''The novel''s reception, initially tepid, has undergone a striking reappraisal in light of recent scholarship.'' Which describes the trajectory of the novel''s reputation?', '{"A":"It was always celebrated.","B":"It was first received coolly but has since been reassessed positively.","C":"It has always been ignored.","D":"It was popular and then dismissed."}'::jsonb, '"B"', '''Initially tepid'' = lukewarm at first; ''striking reappraisal in light of recent scholarship'' = significant reassessment, presumably more favourable.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Which is a natural way to give yourself thinking time?', '{"A":"Just a moment...","B":"Wait! Wait!","C":"Hmm, let me think.","D":"Both A and C are acceptable"}'::jsonb, '"D"', 'Both polite phrases give the speaker thinking time naturally.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Pick the natural filler: ''___, I think it''s a good idea.''', '{"A":"Well","B":"Stop","C":"Goodbye","D":"Please"}'::jsonb, '"A"', '''Well'' is a common natural opener.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Choose the natural hesitation phrase: ''___, I haven''t decided yet.''', '{"A":"To be honest","B":"Goodbye","C":"Sorry stop","D":"Forever"}'::jsonb, '"A"', '''To be honest'' naturally introduces a frank, hesitant answer.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Which is the most natural way to add detail?', '{"A":"For example,","B":"Stop now,","C":"Begin,","D":"End,"}'::jsonb, '"A"', '''For example'' introduces an illustration naturally.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Pick the natural conversation filler: ''I went to the park ___ I met a friend.''', '{"A":"and","B":"stop","C":"end","D":"finish"}'::jsonb, '"A"', '''And'' is a basic but natural connector to extend a sentence.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Which is a natural way to start an opinion?', '{"A":"I think...","B":"I am thought.","C":"Thinking yes.","D":"My head."}'::jsonb, '"A"', '''I think'' is the most basic and natural opinion opener.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Choose the natural follow-up: ''I love hiking. ___''', '{"A":"It''s something I do every weekend.","B":"Hiking.","C":"Stop hiking.","D":"Hike no."}'::jsonb, '"A"', 'Adding a complete sentence extends the answer fluently.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Pick the natural way to ask for clarification: ''___ what do you mean?''', '{"A":"Sorry,","B":"Stop,","C":"Bad,","D":"Now,"}'::jsonb, '"A"', '''Sorry, what do you mean?'' is a polite, natural request for clarification.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Which is the natural way to agree?', '{"A":"Yes, you''re right.","B":"Right yes you.","C":"You yes right.","D":"Right me."}'::jsonb, '"A"', 'Standard natural agreement phrase.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Choose the natural opener: ''___, I prefer coffee to tea.''', '{"A":"Personally","B":"Personally me","C":"Person","D":"Personality"}'::jsonb, '"A"', '''Personally'' naturally introduces a personal preference.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Pick the right word: ''I went home ___ I was tired.''', '{"A":"because","B":"so go","C":"why","D":"there"}'::jsonb, '"A"', '''Because'' connects the action and reason fluently.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Which is natural for adding information?', '{"A":"Also,","B":"All so,","C":"Stop,","D":"Big,"}'::jsonb, '"A"', '''Also'' naturally extends the answer.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Choose the natural way to describe likes: ''I like swimming ___ jogging.''', '{"A":"and","B":"end","C":"stop","D":"why"}'::jsonb, '"A"', '''And'' joins two activities naturally.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Pick the natural sentence opener: ''___, I had a great day.''', '{"A":"Today","B":"Wednesdays","C":"Big","D":"In"}'::jsonb, '"A"', 'Time markers like ''today'' open answers naturally.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Which fits: ''I usually wake up at 7am, ___ I have breakfast.''', '{"A":"then","B":"stop","C":"big","D":"now"}'::jsonb, '"A"', '''Then'' shows the next event in a sequence.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Choose the natural addition: ''I love football. ___ I play every weekend.''', '{"A":"In fact,","B":"Big fact,","C":"Stop,","D":"Why,"}'::jsonb, '"A"', '''In fact'' emphasises and extends the previous statement.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Pick the natural conversation closer: ''That''s all I want to say ___ this.''', '{"A":"about","B":"on","C":"in","D":"both A and B are acceptable"}'::jsonb, '"D"', '''About'' and ''on'' are both natural here.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Which is the natural follow-up: ''Yes, I agree. ___''', '{"A":"It makes a lot of sense.","B":"Sense it.","C":"Yes.","D":"Sure no."}'::jsonb, '"A"', 'Extending agreement with a reason maintains fluency.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Choose the natural opener: ''The first thing I do is ___''', '{"A":"check my phone.","B":"check.","C":"phone.","D":"in phone."}'::jsonb, '"A"', 'A complete sentence keeps fluency natural.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'BEGINNER', 'MCQ', 'Pick the natural connector: ''I love books, ___ I read every day.''', '{"A":"so","B":"big","C":"why","D":"if not"}'::jsonb, '"A"', '''So'' shows the result naturally.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Which is a natural fluent filler: ''___, that''s a good question.''', '{"A":"That''s interesting","B":"Big","C":"Stop","D":"Why"}'::jsonb, '"A"', 'Acknowledging the question buys natural thinking time.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Pick the natural transition: ''___, I think the most important factor is location.''', '{"A":"In my view","B":"My head","C":"Big think","D":"Now"}'::jsonb, '"A"', '''In my view'' is a fluent, natural opinion marker.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Choose the natural paraphrase technique: ''Public transport — ___ — should be improved.''', '{"A":"buses and trains","B":"big things","C":"travel things","D":"yes things"}'::jsonb, '"A"', 'Self-clarifying with examples shows natural fluency.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Pick the natural hesitation device: ''It''s ___ a difficult question.''', '{"A":"sort of","B":"stop","C":"never","D":"really not"}'::jsonb, '"A"', '''Sort of'' naturally hedges and softens.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Which is the most natural way to extend an answer?', '{"A":"What I mean is...","B":"What me say is.","C":"Stop me say.","D":"Mean what."}'::jsonb, '"A"', '''What I mean is...'' fluently elaborates on a previous point.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Choose the natural connector: ''I love city life, ___ I sometimes miss the countryside.''', '{"A":"although","B":"however because","C":"why now","D":"so what"}'::jsonb, '"A"', '''Although'' fluently introduces a contrasting idea.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Pick the natural way to give an example: ''Many things, ___ technology, have improved.''', '{"A":"such as","B":"so like","C":"like why","D":"in like"}'::jsonb, '"A"', '''Such as'' naturally introduces examples.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Which is the natural way to summarise: ''___, I think it''s a positive change.''', '{"A":"All in all","B":"All inside","C":"Why all","D":"Big all"}'::jsonb, '"A"', '''All in all'' summarises naturally.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Choose the fluent opener: ''___ how do I start? Well, I think...''', '{"A":"Let me see —","B":"Stop me see","C":"Big think","D":"Now me"}'::jsonb, '"A"', '''Let me see'' is a fluent, natural thinking-time phrase.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Pick the natural extension: ''I don''t watch much TV. ___, I prefer reading.''', '{"A":"Instead","B":"In stead big","C":"Stop","D":"Then big"}'::jsonb, '"A"', '''Instead'' fluently introduces an alternative preference.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Which is the most natural reformulation: ''I find it difficult — ___ — to wake up early.''', '{"A":"or rather, challenging","B":"big rather","C":"stop or","D":"big challenge yes"}'::jsonb, '"A"', '''Or rather'' fluently reformulates a word for precision.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Choose the natural follow-up to elaborate: ''I love jazz music. ___''', '{"A":"Particularly the saxophone solos.","B":"Particular saxophone.","C":"In jazz.","D":"Saxophone jazz why."}'::jsonb, '"A"', 'Adding specific detail maintains natural fluent extension.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Pick the natural signal of opinion change: ''___, I''d say it''s mostly positive.''', '{"A":"On reflection","B":"On think","C":"On stop","D":"Now in"}'::jsonb, '"A"', '''On reflection'' fluently signals reconsideration.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Which is the natural fluent filler: ''Yeah, ___, exercise is really beneficial.''', '{"A":"you know","B":"you knew","C":"why know","D":"know yes you"}'::jsonb, '"A"', '''You know'' is a natural conversational filler.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Choose the natural transition: ''___, the impact has been significant.''', '{"A":"Without a doubt","B":"Without big","C":"Doubt no","D":"Big without"}'::jsonb, '"A"', '''Without a doubt'' fluently expresses certainty.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Pick the natural answer extension: ''I enjoy travelling because ___''', '{"A":"it allows me to experience different cultures.","B":"different cultures.","C":"big travel.","D":"culture different yes."}'::jsonb, '"A"', 'A reasoned full-sentence extension demonstrates fluency.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Which is the natural way to reconsider: ''___ thinking about it more, I''d say...''', '{"A":"On second thought","B":"On second think","C":"Two thought","D":"Two think"}'::jsonb, '"A"', '''On second thought'' is a fluent natural reconsideration phrase.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Choose the natural softener: ''It''s ___ a complex issue.''', '{"A":"kind of","B":"kindly of","C":"in kind","D":"kind so"}'::jsonb, '"A"', '''Kind of'' is a natural, common softener.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Pick the natural extension: ''I work as a teacher. ___ I teach mathematics.''', '{"A":"Specifically,","B":"Special big","C":"Why specific","D":"In stop"}'::jsonb, '"A"', '''Specifically'' fluently narrows down to detail.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'INTERMEDIATE', 'MCQ', 'Which is a natural opener for a Speaking Part 2 long turn?', '{"A":"I''d like to talk about my best friend, who I''ve known since childhood.","B":"Best friend.","C":"Long friend talk.","D":"Friend big me say."}'::jsonb, '"A"', 'A clear topic-introducing sentence opens long turns naturally.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Which fluency device best handles a sudden mid-sentence reformulation?', '{"A":"...or perhaps more accurately,...","B":"or perhaps more accuracy","C":"... in the more accurate","D":"more accurate big"}'::jsonb, '"A"', '''Or perhaps more accurately'' is a sophisticated mid-sentence self-correction.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Pick the most natural fluency-saver for hesitation: ''That''s a really thought-provoking question. ___''', '{"A":"Let me consider that for a moment.","B":"Wait big.","C":"Stop think me.","D":"Why now you."}'::jsonb, '"A"', 'This polished phrase buys thinking time elegantly.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Choose the most fluent contrastive extender: ''On one hand, technology connects us; ___ it can isolate us.''', '{"A":"on the other hand","B":"on second hand","C":"in another hand","D":"on the other"}'::jsonb, '"A"', '''On the other hand'' is the standard fluent contrast marker.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Pick the most natural advanced discourse marker: ''___ this is a sensitive topic, I''ll try to give my honest view.''', '{"A":"Acknowledging that","B":"Knowing","C":"Big that","D":"Why that"}'::jsonb, '"A"', '''Acknowledging that...'' gracefully signals awareness of complexity.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Which is the most natural fluency-extending phrase for Speaking Part 3?', '{"A":"That raises an interesting point about...","B":"Point interesting raise.","C":"Stop point.","D":"Why point me."}'::jsonb, '"A"', 'This phrase naturally extends the discussion in advanced speech.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Choose the most fluent self-correction: ''I''d say roughly half — ___ — of young people use it.''', '{"A":"or, more precisely, around 45%","B":"more big precise","C":"45% in big","D":"so percent"}'::jsonb, '"A"', '''Or, more precisely,...'' is a polished self-correction technique.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Pick the most natural hedging fluency device: ''___ from what I''ve read, the evidence is mixed.''', '{"A":"As far as I can tell","B":"As far me tell","C":"In far tell","D":"Tell far"}'::jsonb, '"A"', '''As far as I can tell'' fluently hedges a claim.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Which fluency phrase best signals a nuanced position?', '{"A":"It really depends on how you look at it.","B":"Look it depends.","C":"Big depends look.","D":"Why depend on look."}'::jsonb, '"A"', 'This natural phrase introduces nuance fluently.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Choose the most polished discourse marker for adding a second consideration: ''___, we shouldn''t overlook the cultural dimension.''', '{"A":"That said","B":"Said big","C":"Said why","D":"That big"}'::jsonb, '"A"', '''That said'' fluently introduces a balancing point.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Pick the most fluent recovery from a mistake: ''Sorry, ___ what I meant to say was...''', '{"A":"let me rephrase that —","B":"let me rephrase me","C":"phrase let me","D":"big rephrase"}'::jsonb, '"A"', '''Let me rephrase that'' is natural and fluent self-correction.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Which is the most natural advanced filler: ''___ I think the key issue is education.''', '{"A":"Ultimately","B":"Ultimate big","C":"Ultimate why","D":"Big ultimate"}'::jsonb, '"A"', '''Ultimately'' is a polished, fluent discourse marker.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Choose the most refined fluency extender: ''___ this is something I''ve thought about a lot recently.''', '{"A":"As it happens,","B":"Big happens","C":"Happens in","D":"In big"}'::jsonb, '"A"', '''As it happens'' is a natural fluent introduction.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Pick the most natural advanced hesitation phrase: ''___ how to put this... I think it''s complicated.''', '{"A":"Let me think about","B":"Think me about","C":"Stop big","D":"Why me think"}'::jsonb, '"A"', '''Let me think about how to put this'' naturally signals careful word choice.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Which is the most polished tag question for fluent speech: ''It''s a difficult balance, ___?''', '{"A":"isn''t it","B":"don''t it","C":"no it","D":"yes it"}'::jsonb, '"A"', '''Isn''t it?'' is a natural fluent tag question for involvement.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Choose the most natural advanced extender: ''I''d argue that ___ this is a uniquely modern problem.''', '{"A":"in many respects","B":"big respects","C":"in respect","D":"respect big"}'::jsonb, '"A"', '''In many respects'' fluently qualifies a strong claim.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Pick the most fluent advanced bridging phrase: ''___ what we were discussing earlier...''', '{"A":"Coming back to","B":"Come big to","C":"Back come","D":"Big come"}'::jsonb, '"A"', '''Coming back to...'' fluently returns to a prior topic.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Which is the most natural advanced opener for a contrary view: ''___, I don''t entirely agree.''', '{"A":"To be perfectly honest","B":"Honest big perfect","C":"Big honest","D":"Why perfect"}'::jsonb, '"A"', '''To be perfectly honest'' is a polished, fluent opener for a frank view.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Choose the most natural fluency device for stating something obvious: ''___ the impact has been considerable.''', '{"A":"Needless to say,","B":"Need say,","C":"Big need,","D":"In need"}'::jsonb, '"A"', '''Needless to say'' fluently emphasises an obvious point.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Pick the most polished phrase for backing up an opinion: ''I feel strongly about this, ___ I''ve seen the consequences firsthand.''', '{"A":"not least because","B":"not big because","C":"not last","D":"last not"}'::jsonb, '"A"', '''Not least because'' is a sophisticated reasoning marker.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'FLUENCY', 'ADVANCED', 'MCQ', 'Which is the most fluent advanced way to change topic: ''___, what about the environmental angle?''', '{"A":"Shifting gears","B":"Shift gear big","C":"Big shift","D":"Shifting big"}'::jsonb, '"A"', '''Shifting gears'' is an idiomatic fluent topic-change device.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'In a speaking test, which is the most natural way to talk about your job?', '{"A":"I am work in a bank.","B":"I work in a bank.","C":"I working in a bank.","D":"I works in a bank."}'::jsonb, '"B"', 'Simple present tense for routine work: ''I work''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which sentence is correct for describing where you live?', '{"A":"I live in London since 5 years.","B":"I have been living in London for 5 years.","C":"I am living London 5 years.","D":"I live London 5 years."}'::jsonb, '"B"', 'Present perfect continuous with ''for'' indicates ongoing duration.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct response: ''Do you like coffee?''', '{"A":"Yes, I likes.","B":"Yes, I do.","C":"Yes, I am.","D":"Yes, I have."}'::jsonb, '"B"', 'Short answers mirror the auxiliary in the question: ''Do you...?'' → ''Yes, I do.''');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which is correct: ''I ___ tea every morning.''', '{"A":"drinking","B":"drinks","C":"drink","D":"drank"}'::jsonb, '"C"', 'Routine actions take the simple present tense: ''I drink''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Pick the right form: ''My family ___ four people.''', '{"A":"have","B":"has","C":"having","D":"is have"}'::jsonb, '"B"', '''Family'' as a single unit takes a singular verb in many contexts; ''has'' is correct here.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which sentence is grammatically correct?', '{"A":"I am from India and I am 25 years old.","B":"I from India and I 25 years old.","C":"I am from India and I have 25 years.","D":"I from India and have 25 years."}'::jsonb, '"A"', 'Use ''be'' for nationality and age in English (not ''have'').');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct answer: ''How long ___ you ___ English?''', '{"A":"do / study","B":"have / studied","C":"are / studying","D":"did / study"}'::jsonb, '"B"', '''How long have you...?'' present perfect, asking about duration up to now.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which is correct: ''Last weekend, I ___ to the beach.''', '{"A":"go","B":"going","C":"went","D":"have gone"}'::jsonb, '"C"', 'Simple past tense (''went'') is appropriate with ''last weekend''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Pick the right preposition: ''I am interested ___ music.''', '{"A":"on","B":"in","C":"at","D":"of"}'::jsonb, '"B"', '''Interested in'' is the fixed expression.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which sentence is correct?', '{"A":"I have two brother and one sister.","B":"I have two brothers and one sister.","C":"I have two brothers and one sisters.","D":"I has two brothers and one sister."}'::jsonb, '"B"', 'Plural nouns take the -s ending: ''brothers''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct present continuous: ''Right now, I ___.''', '{"A":"talk to you","B":"am talking to you","C":"talking to you","D":"talked to you"}'::jsonb, '"B"', 'Present continuous (am + verb-ing) describes actions happening now.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which is correct: ''I ___ TV last night.''', '{"A":"watch","B":"watched","C":"watching","D":"have watched"}'::jsonb, '"B"', 'Simple past tense with ''last night''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Pick the correct answer: ''What ___ you do tomorrow?''', '{"A":"are","B":"do","C":"will","D":"have"}'::jsonb, '"C"', 'Future plans use ''will'' (or ''are you going to'').');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which sentence is correct?', '{"A":"I am liking my job very much.","B":"I like my job very much.","C":"I am like my job very much.","D":"I likes my job very much."}'::jsonb, '"B"', '''Like'' is a stative verb — use simple present, not continuous.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the right form: ''There ___ many people at the party.''', '{"A":"is","B":"was","C":"were","D":"are being"}'::jsonb, '"C"', '''Many people'' is plural and the past form requires ''were''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which is the natural way to describe a hobby?', '{"A":"I am like to read.","B":"I like reading.","C":"I am liking read.","D":"I liking to read."}'::jsonb, '"B"', '''Like'' followed by a gerund expresses enjoyment of an activity.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Pick the correct sentence: ''How often ___ you exercise?''', '{"A":"are","B":"do","C":"have","D":"is"}'::jsonb, '"B"', 'For frequency questions in present simple, use ''do''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which is correct: ''I ___ born in 1995.''', '{"A":"am","B":"have","C":"was","D":"have been"}'::jsonb, '"C"', '''Was born'' is the standard fixed phrase for stating birth year.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the right pronoun: ''My friend and ___ went to the cinema.''', '{"A":"me","B":"I","C":"my","D":"mine"}'::jsonb, '"B"', 'Subject pronoun ''I'' is used as part of the sentence subject.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which is correct: ''I ___ ever been to Japan.''', '{"A":"never","B":"have never","C":"don''t never","D":"am never"}'::jsonb, '"B"', 'Present perfect for life experience: ''I have never been''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which is the most natural answer to ''What were you doing at 8pm yesterday?''', '{"A":"I had dinner.","B":"I was having dinner.","C":"I am having dinner.","D":"I have had dinner."}'::jsonb, '"B"', 'Past continuous describes an action in progress at a specific past time.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the best answer: ''How would your life be different if you had studied medicine?''', '{"A":"I will be a doctor.","B":"I would be a doctor.","C":"I am a doctor.","D":"I was a doctor."}'::jsonb, '"B"', 'Mixed conditional: past unreal condition with present result uses ''would'' + base form.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Pick the correct form: ''I''m tired because I ___ all morning.''', '{"A":"have worked","B":"have been working","C":"am working","D":"worked"}'::jsonb, '"B"', 'Present perfect continuous emphasises ongoing recent activity.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which sentence is most natural?', '{"A":"I used to playing football when I was young.","B":"I used to play football when I was young.","C":"I am used to play football when I was young.","D":"I used playing football when I was young."}'::jsonb, '"B"', '''Used to'' + base form expresses past habits no longer true.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the correct response: ''Have you ever travelled abroad?''', '{"A":"Yes, last year I am going to France.","B":"Yes, I went to France last year.","C":"Yes, I have went to France.","D":"Yes, I am went to France."}'::jsonb, '"B"', 'After present perfect, switch to past simple for specific past times (''last year'').');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Pick the right form: ''If I ___ time, I would learn another language.''', '{"A":"have","B":"had","C":"will have","D":"having"}'::jsonb, '"B"', 'Second conditional uses past simple in the if-clause for hypothetical situations.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which is the best phrase: ''I ___ visit my grandparents every summer.''', '{"A":"used to","B":"would","C":"am used to","D":"am usually"}'::jsonb, '"B"', '''Would'' (like ''used to'') describes repeated past habits.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the correct answer: ''How long have you known her?''', '{"A":"For ten years.","B":"In ten years.","C":"Ten years ago.","D":"At ten years."}'::jsonb, '"A"', '''For'' + duration is used with ''how long'' questions.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Pick the natural sentence: ''By the end of next year, I ___ in this company for ten years.''', '{"A":"will work","B":"will be working","C":"will have been working","D":"have been working"}'::jsonb, '"C"', 'Future perfect continuous expresses duration up to a future point.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which is most natural: ''I wish I ___ taller.''', '{"A":"am","B":"was","C":"were","D":"would be"}'::jsonb, '"C"', 'After ''wish'' for present unreal situations, formal English uses ''were'' for all subjects.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the correct sentence: ''I''d rather ___ at home tonight.''', '{"A":"to stay","B":"stay","C":"staying","D":"stayed"}'::jsonb, '"B"', '''Would rather'' is followed by the bare infinitive.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Pick the most natural option: ''When I arrived, the meeting ___.''', '{"A":"already started","B":"had already started","C":"has already started","D":"already starts"}'::jsonb, '"B"', 'Past perfect describes an event that occurred before another past event.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which is correct: ''I''m not used to ___ so early.''', '{"A":"wake up","B":"waking up","C":"woke up","D":"wakes up"}'::jsonb, '"B"', '''Be used to'' (to be accustomed to) is followed by a gerund.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the natural form: ''It''s the most beautiful place I ___.''', '{"A":"ever visited","B":"have ever visited","C":"am ever visiting","D":"ever visit"}'::jsonb, '"B"', 'Present perfect with ''ever'' is used after superlatives to talk about life experience.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Pick the right form: ''You ___ better take an umbrella.''', '{"A":"would","B":"had","C":"have","D":"will"}'::jsonb, '"B"', '''Had better'' (often pronounced ''d better'') gives strong advice.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which sounds most natural: ''I ___ go to the gym, but I''m not sure.''', '{"A":"can","B":"might","C":"must","D":"will"}'::jsonb, '"B"', '''Might'' expresses uncertain future plans.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the correct sentence: ''It ___ for two hours when we finally arrived.''', '{"A":"rained","B":"had been raining","C":"has been raining","D":"is raining"}'::jsonb, '"B"', 'Past perfect continuous describes a duration up to a past point.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Pick the natural answer: ''Why are your shoes wet?''', '{"A":"I have walked in the rain.","B":"I''ve been walking in the rain.","C":"I walked in the rain since morning.","D":"I am walking in the rain."}'::jsonb, '"B"', 'Present perfect continuous explains the visible result of a recent ongoing action.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which is correct: ''I ___ rather you ___ smoke here.''', '{"A":"would / didn''t","B":"would / don''t","C":"will / don''t","D":"would / wouldn''t"}'::jsonb, '"A"', '''Would rather'' + subject + past simple expresses preference about another''s actions.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the most natural form: ''She must ___ home already; her car isn''t here.''', '{"A":"go","B":"gone","C":"have gone","D":"went"}'::jsonb, '"C"', '''Must have + past participle'' expresses logical deduction about the past.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which response demonstrates sophisticated tense use for IELTS Speaking Part 3?', '{"A":"Things have changed and will change more.","B":"Whilst significant transformations have occurred over the past decade, I anticipate that the pace of change will only accelerate further.","C":"Things change.","D":"It changed and changes."}'::jsonb, '"B"', 'It correctly uses present perfect for completed change up to now and ''will'' for future projection.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Pick the most natural inversion for emphasis in spoken English.', '{"A":"Never I have seen something like that.","B":"Never have I seen anything like that.","C":"Never seen I have anything like that.","D":"Never I seen anything like that."}'::jsonb, '"B"', 'Inversion after ''never'' for emphasis: auxiliary precedes subject.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the most idiomatic mixed conditional: ''If we ___ the train, we ___ here in Paris now.''', '{"A":"didn''t miss / would be","B":"hadn''t missed / would be","C":"didn''t miss / will be","D":"haven''t missed / would be"}'::jsonb, '"B"', 'Past condition + present result: ''hadn''t missed'' / ''would be''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which is the most polished response: ''In an ideal world, what would you change?''', '{"A":"I would have changed many things.","B":"Were I given the opportunity, I would prioritise educational reform above all.","C":"I want to change things.","D":"Many changes I would make."}'::jsonb, '"B"', '''Were I given...'' is a sophisticated formal inversion used for hypothetical conditions.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Pick the natural use of cleft sentence for emphasis.', '{"A":"I really want to visit Japan.","B":"What I really want is to visit Japan.","C":"Visit Japan I want really.","D":"Japan visit really I want."}'::jsonb, '"B"', 'Cleft ''What I... is...'' shifts emphasis effectively in spoken English.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which conveys the strongest hedged opinion?', '{"A":"It''s definitely the best.","B":"There''s a strong case to be made that this approach is preferable.","C":"It''s good, I think.","D":"The best, surely."}'::jsonb, '"B"', '''There''s a strong case to be made that...'' is a sophisticated hedge ideal for nuanced opinion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the most natural use of the future continuous.', '{"A":"Tomorrow this time I will work.","B":"This time tomorrow, I''ll be flying to Madrid.","C":"At this time tomorrow I am working.","D":"I will be work this time tomorrow."}'::jsonb, '"B"', 'Future continuous depicts an action in progress at a future time.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Pick the most idiomatic response: ''If only ___.''', '{"A":"I would have known earlier","B":"I had known earlier","C":"I have known earlier","D":"I knew earlier"}'::jsonb, '"B"', 'After ''if only'' for past regret, use past perfect: ''had known''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence demonstrates correct use of subjunctive after ''suggest''?', '{"A":"He suggested that I am more careful.","B":"He suggested that I be more careful.","C":"He suggested that I will be more careful.","D":"He suggested I being more careful."}'::jsonb, '"B"', '''Suggest'' + that + base form (mandative subjunctive) is preferred in formal use.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the most polished sentence: ''I doubt very much ___.''', '{"A":"that he comes","B":"that he will come","C":"that he is coming","D":"that he came"}'::jsonb, '"B"', 'After ''doubt that'', future events take ''will + base form''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Pick the most natural use of ''should'' for surprise: ''It''s strange that he ___ leave so suddenly.''', '{"A":"will","B":"should","C":"would","D":"had"}'::jsonb, '"B"', '''It''s strange/odd that... should'' is a formal way of expressing surprise.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence shows correct use of perfect modal for past speculation?', '{"A":"He could be at the meeting yesterday.","B":"He could have been at the meeting yesterday.","C":"He can have been at the meeting yesterday.","D":"He must been at the meeting yesterday."}'::jsonb, '"B"', '''Could have + past participle'' speculates about past possibilities.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the most idiomatic phrasing: ''___ his rudeness, I tried to be polite.''', '{"A":"In spite he was rude","B":"In spite of his rudeness","C":"In spite his rude","D":"Despite of his rudeness"}'::jsonb, '"B"', '''In spite of'' is followed by a noun phrase.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Pick the most natural response: ''I look forward ___ from you.''', '{"A":"to hear","B":"to hearing","C":"hearing","D":"hear"}'::jsonb, '"B"', '''Look forward to'' is followed by a gerund.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which conveys politeness most appropriately?', '{"A":"Give me water.","B":"Could you possibly pass me some water?","C":"Water!","D":"You give water."}'::jsonb, '"B"', '''Could you possibly...'' is a polished, polite request form.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the most natural use of reduced relative clause.', '{"A":"The book that is lying on the table is mine.","B":"The book lying on the table is mine.","C":"The book lies on the table is mine.","D":"The book is lying on the table mine."}'::jsonb, '"B"', 'Reducing ''that is'' + present participle is a stylistically natural simplification.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Pick the most idiomatic concessive phrase.', '{"A":"As tired I was, I finished.","B":"Tired as I was, I finished.","C":"Although as tired, I finished.","D":"As I was tired, finishing."}'::jsonb, '"B"', '''Adjective + as + subject + verb'' is a literary concession form, increasingly used in spoken English.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which is the most natural: ''It''s not until you live abroad ___ truly appreciate your home country.''', '{"A":"that you","B":"when you","C":"and you","D":"you do"}'::jsonb, '"A"', '''It''s not until... that...'' is a cleft structure for emphasis.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the most polished sentence using participle phrases.', '{"A":"Having lived in three countries I know cultures.","B":"Having lived in three countries, I have come to appreciate cultural diversity firsthand.","C":"I lived in three countries and I know cultures.","D":"After live in three countries, knowing cultures."}'::jsonb, '"B"', 'Participle phrase opener with the perfect form (''Having lived'') signals sophisticated discourse.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Pick the most natural response: ''I''d sooner ___ in than go out tonight.''', '{"A":"to stay","B":"stay","C":"staying","D":"stayed"}'::jsonb, '"B"', '''I''d sooner'' (preference) is followed by the bare infinitive.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which syllable is stressed in the word ''TABLE''?', '{"A":"First (TA-ble)","B":"Second (ta-BLE)","C":"Both equally","D":"Neither"}'::jsonb, '"A"', 'Two-syllable English nouns most commonly carry stress on the first syllable: TA-ble.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which word has a silent letter?', '{"A":"Cat","B":"Knee","C":"Run","D":"Pen"}'::jsonb, '"B"', 'In ''knee'' the letter ''k'' is silent; the word is pronounced /niː/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which word rhymes with ''CAT''?', '{"A":"Cup","B":"Hat","C":"Cot","D":"Coat"}'::jsonb, '"B"', '''Hat'' shares the same /æt/ ending as ''cat'', so it rhymes.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'How many syllables does ''BANANA'' have?', '{"A":"Two","B":"Three","C":"Four","D":"One"}'::jsonb, '"B"', 'Ba-NA-na has three syllables, with stress on the middle syllable.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which syllable is stressed in ''COMPUTER''?', '{"A":"com-","B":"-pu-","C":"-ter","D":"All equally"}'::jsonb, '"B"', 'The word is pronounced com-PU-ter, with primary stress on the second syllable.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which word has the /iː/ sound (long ''ee'') as in ''see''?', '{"A":"Sit","B":"Set","C":"Seat","D":"Sat"}'::jsonb, '"C"', '''Seat'' contains the long /iː/ vowel; ''sit'' has the short /ɪ/ sound.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'In which word is the ''h'' silent?', '{"A":"House","B":"Happy","C":"Hour","D":"Hello"}'::jsonb, '"C"', '''Hour'' is pronounced /aʊər/ — the initial ''h'' is not pronounced.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which word has the same vowel sound as ''CAR''?', '{"A":"Cat","B":"Far","C":"Care","D":"Curl"}'::jsonb, '"B"', '''Car'' and ''far'' both contain the long /ɑː/ vowel sound.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'When asking a yes/no question in English, the voice usually:', '{"A":"Falls at the end","B":"Rises at the end","C":"Stays flat","D":"Falls then rises"}'::jsonb, '"B"', 'Yes/no questions in English typically use rising intonation at the end.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which syllable is stressed in ''WATER''?', '{"A":"wa-","B":"-ter","C":"Both equally","D":"Neither"}'::jsonb, '"A"', '''Water'' has a stressed first syllable: WA-ter.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which word does NOT rhyme with the others?', '{"A":"Tree","B":"Bee","C":"Sea","D":"Sky"}'::jsonb, '"D"', 'Tree, bee and sea share the /iː/ ending; ''sky'' ends in /aɪ/, so it doesn''t rhyme.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'How is the past tense ending ''-ed'' pronounced in ''WALKED''?', '{"A":"/ɪd/","B":"/d/","C":"/t/","D":"/əd/"}'::jsonb, '"C"', 'After voiceless consonants like /k/, the ''-ed'' ending is pronounced /t/: ''walkt''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which word has the short /ʊ/ sound as in ''BOOK''?', '{"A":"Boot","B":"Foot","C":"Boat","D":"Bait"}'::jsonb, '"B"', '''Foot'' uses the short /ʊ/ sound, the same as ''book''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which syllable is stressed in ''TEACHER''?', '{"A":"tea-","B":"-cher","C":"Both equally","D":"Depends on speaker"}'::jsonb, '"A"', '''Teacher'' is pronounced TEA-cher with stress on the first syllable.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'In ''island'', which letter is silent?', '{"A":"i","B":"s","C":"l","D":"d"}'::jsonb, '"B"', 'The ''s'' in ''island'' is silent; the word is pronounced /ˈaɪlənd/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which word starts with the /θ/ sound (as in ''think'')?', '{"A":"This","B":"That","C":"Three","D":"Then"}'::jsonb, '"C"', '''Three'' begins with the voiceless /θ/ sound; ''this/that/then'' begin with voiced /ð/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which pair of words rhymes?', '{"A":"Eight – weight","B":"Cough – bough","C":"Tear – bear","D":"Comb – tomb"}'::jsonb, '"A"', '''Eight'' and ''weight'' both end with the /eɪt/ sound; the others look similar but sound different.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which word has three syllables?', '{"A":"Apple","B":"Banana","C":"Cat","D":"Book"}'::jsonb, '"B"', 'Ba-na-na has three syllables; ''apple'' has two and ''cat''/''book'' have one.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'How is ''WANTED'' pronounced — how many syllables does the past tense add?', '{"A":"One extra syllable /ɪd/","B":"No extra syllable","C":"Two extra syllables","D":"It removes a syllable"}'::jsonb, '"A"', 'After /t/ or /d/, ''-ed'' adds the syllable /ɪd/, so ''want-ed'' has two syllables.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'BEGINNER', 'MCQ', 'Which word has the same starting sound as ''SHIP''?', '{"A":"Sip","B":"Chip","C":"Sheep","D":"Tip"}'::jsonb, '"C"', '''Ship'' and ''sheep'' both begin with the /ʃ/ sound; ''sip'' starts with /s/, ''chip'' with /tʃ/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which syllable is stressed in ''PHOTOGRAPH''?', '{"A":"PHO-to-graph","B":"pho-TO-graph","C":"pho-to-GRAPH","D":"All equally"}'::jsonb, '"A"', '''Photograph'' has primary stress on the first syllable: PHO-to-graph.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which syllable is stressed in ''PHOTOGRAPHY''?', '{"A":"pho-","B":"-tog-","C":"-ra-","D":"-phy"}'::jsonb, '"B"', 'Adding the suffix ''-y'' shifts stress: pho-TOG-ra-phy. Stress patterns often move when suffixes are added.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which word has the /ʌ/ sound (as in ''cup'')?', '{"A":"Cap","B":"Cope","C":"Cup","D":"Cape"}'::jsonb, '"C"', '''Cup'' contains the /ʌ/ vowel; the other options use /æ/, /əʊ/ and /eɪ/ respectively.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'When two words connect in fast speech, what do we call the joining sound, e.g. ''an apple'' /ən‿æpl/?', '{"A":"Stress","B":"Linking","C":"Reduction","D":"Elision"}'::jsonb, '"B"', 'Linking is the smooth connection between a word ending in a consonant and the next word starting with a vowel.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which word has a different vowel sound from the others?', '{"A":"Ship","B":"Sheep","C":"Live (verb)","D":"Sit"}'::jsonb, '"B"', '''Sheep'' has the long /iː/; the others use the short /ɪ/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'In the sentence ''I want to go'', the ''to'' is usually pronounced as:', '{"A":"/tuː/ (full form)","B":"/tə/ (weak form)","C":"/tʌ/","D":"/tɔː/"}'::jsonb, '"B"', 'Function words like ''to'' are typically reduced to the weak form /tə/ in connected speech.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which word does the stress fall on differently from the others?', '{"A":"REcord (noun)","B":"PREsent (gift)","C":"OBject (thing)","D":"reFUSE (verb)"}'::jsonb, '"D"', '''Refuse'' as a verb is stressed on the second syllable; the noun forms in A–C are stressed on the first.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which word contains the diphthong /aʊ/ (as in ''house'')?', '{"A":"Throw","B":"Town","C":"Toe","D":"Two"}'::jsonb, '"B"', '''Town'' contains the /aʊ/ diphthong; ''throw'' and ''toe'' have /əʊ/ and ''two'' has /uː/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which word has a silent ''b''?', '{"A":"Robber","B":"Lamb","C":"Bottle","D":"Bubble"}'::jsonb, '"B"', 'In ''lamb'', the final ''b'' is silent — pronounced /læm/. The ''b'' is also silent in ''climb'', ''thumb'' and ''comb''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which sentence shows correct sentence stress on the most important word?', '{"A":"I LIVE in London.","B":"I live IN London.","C":"I live in LONDON.","D":"I live in lon-DON."}'::jsonb, '"C"', 'Content words (especially nouns at the end) typically receive primary sentence stress in neutral statements.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which word starts with the /tʃ/ sound (as in ''church'')?', '{"A":"Chemistry","B":"Champagne","C":"Charity","D":"Chiffon"}'::jsonb, '"C"', '''Charity'' begins with /tʃ/; ''chemistry'' starts with /k/, while ''champagne'' and ''chiffon'' begin with /ʃ/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'How is the ''-s'' in ''CATS'' pronounced?', '{"A":"/s/","B":"/z/","C":"/ɪz/","D":"/əs/"}'::jsonb, '"A"', 'After voiceless consonants like /t/, plural ''-s'' is pronounced /s/. Compare with ''dogs'' /dɒgz/ where it''s /z/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which word has stress on the SECOND syllable?', '{"A":"Hotel","B":"Office","C":"Mountain","D":"Doctor"}'::jsonb, '"A"', '''Hotel'' is pronounced ho-TEL with stress on the second syllable; the others have first-syllable stress.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which pair has the SAME vowel sound?', '{"A":"bear – beer","B":"fair – fare","C":"tour – tear","D":"poor – pure"}'::jsonb, '"B"', '''Fair'' and ''fare'' are homophones — both pronounced /feə/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'What does ''schwa'' /ə/ refer to?', '{"A":"A long vowel","B":"A consonant cluster","C":"The neutral, unstressed vowel sound","D":"A diphthong"}'::jsonb, '"C"', 'Schwa /ə/ is the most common vowel in English — a short, neutral sound found in unstressed syllables (e.g. the ''a'' in ''about'').');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which letter combination is silent in ''LISTEN''?', '{"A":"li","B":"t","C":"en","D":"st"}'::jsonb, '"B"', 'The ''t'' in ''listen'' is silent; the word is pronounced /ˈlɪsən/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'In a list ''red, blue and green'', the intonation typically:', '{"A":"Falls on every item","B":"Rises on each except the last (which falls)","C":"Stays flat throughout","D":"Rises only at the end"}'::jsonb, '"B"', 'In English lists, items take rising intonation to signal more is coming, and the final item falls to signal completion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which word does NOT contain the /ʒ/ sound (as in ''measure'')?', '{"A":"Pleasure","B":"Vision","C":"Decision","D":"Mission"}'::jsonb, '"D"', '''Mission'' contains /ʃ/, not /ʒ/; the others all contain the voiced /ʒ/ sound.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which contraction shows correct natural pronunciation?', '{"A":"''I am'' is always pronounced /aɪ æm/","B":"''I''m'' is pronounced /aɪm/","C":"''I am'' is pronounced /aɪˈem/","D":"''I''m'' is pronounced /aɪ m/ as two syllables"}'::jsonb, '"B"', 'The contraction ''I''m'' is pronounced as one syllable /aɪm/, with no separation between sounds.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'INTERMEDIATE', 'MCQ', 'Which word has primary stress on the third syllable?', '{"A":"Information","B":"Happiness","C":"Important","D":"Interesting"}'::jsonb, '"A"', '''Information'' is stressed in-for-MA-tion. Words ending in ''-tion'' typically have primary stress on the syllable before ''-tion''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'In the phrase ''I would have gone'', a fluent native speaker most likely pronounces it as:', '{"A":"/aɪ wʊd hæv gɒn/","B":"/aɪd əv gɒn/","C":"/aɪ wʊd ə gɒn/","D":"/aɪ wʊd hæv gəʊn/"}'::jsonb, '"B"', 'In connected speech, ''I would have'' is typically reduced to /aɪd əv/, with the auxiliaries weakening dramatically.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which phenomenon is illustrated by ''good boy'' becoming /gʊb bɔɪ/ in fast speech?', '{"A":"Elision","B":"Assimilation","C":"Linking","D":"Intrusion"}'::jsonb, '"B"', 'Assimilation is when a sound changes to become more like a neighbouring one — here /d/ becomes /b/ before another /b/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Where does the primary stress fall in ''CHARACTERISTIC''?', '{"A":"CHAR-ac-ter-is-tic","B":"char-AC-ter-is-tic","C":"char-ac-ter-IS-tic","D":"char-ac-TER-is-tic"}'::jsonb, '"C"', 'Words ending in ''-istic'' carry primary stress on the syllable immediately before the suffix: char-ac-ter-IS-tic.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which sentence demonstrates contrastive stress?', '{"A":"I bought a NEW car (not an old one)","B":"I bought a new CAR","C":"I BOUGHT a new car","D":"All convey the same meaning"}'::jsonb, '"A"', 'Contrastive stress falls on the word being contrasted with another (here ''new'' contrasted with ''old''), overriding default sentence stress.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which word contains the ''dark l'' /ɫ/ sound?', '{"A":"Lake","B":"Light","C":"Pull","D":"Long"}'::jsonb, '"C"', 'Dark /ɫ/ occurs in syllable-final positions (as in ''pull'', ''milk''); clear /l/ appears initially as in ''lake'', ''light'', ''long''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'How is the underlined ''t'' typically pronounced in American English in ''better''?', '{"A":"/t/ — clear stop","B":"/d/ — voiced","C":"/ɾ/ — flap/tap","D":"Silent"}'::jsonb, '"C"', 'In American English, intervocalic /t/ between vowels often becomes a flap /ɾ/, making ''better'' sound like ''bedder''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'What is the term for the phenomenon where ''I saw it'' is pronounced as ''I saw r it'' /aɪ sɔːr ɪt/?', '{"A":"Assimilation","B":"Intrusive r","C":"Aspiration","D":"Devoicing"}'::jsonb, '"B"', '''Intrusive r'' is when an /r/ is inserted between two vowels (especially across word boundaries) where one is not present in the spelling.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which word demonstrates aspiration of the initial consonant?', '{"A":"Spin","B":"Pin","C":"Bin","D":"Tin (after /s/)"}'::jsonb, '"B"', 'Voiceless stops /p t k/ are aspirated (with a puff of air) at the start of stressed syllables, as in ''pin'' /pʰɪn/. After /s/ (e.g. ''spin''), they''re not aspirated.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'In ''next day'', the /t/ is often:', '{"A":"Aspirated","B":"Elided (dropped)","C":"Replaced by /d/","D":"Lengthened"}'::jsonb, '"B"', '/t/ is commonly elided when it occurs between two consonants in connected speech: ''nex(t) day'' /neks deɪ/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which word has stress on a different syllable from the others?', '{"A":"PHOTOGRAPHIC","B":"PHOTOGRAPHY","C":"GEOGRAPHIC","D":"MICROSCOPIC"}'::jsonb, '"B"', '''Photography'' has stress on the second syllable (pho-TOG-ra-phy); the others, ending in ''-ic'', stress the syllable before that suffix.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'What is the ''tonic syllable'' in an English intonation phrase?', '{"A":"The first stressed syllable","B":"The most prominent (nuclear) stressed syllable, where pitch movement occurs","C":"Any syllable carrying schwa","D":"The final unstressed syllable"}'::jsonb, '"B"', 'The tonic (nuclear) syllable is the most prominent stressed syllable in a phrase, where the main pitch movement (rise/fall) takes place.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which intonation pattern would most clearly indicate genuine surprise in ''You did WHAT?''', '{"A":"Low fall","B":"High rise","C":"Flat tone","D":"Slight fall"}'::jsonb, '"B"', 'A high rise on ''WHAT'' conveys surprise or disbelief, contrasting with the falling tone used in neutral wh-questions.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which word illustrates the loss of /h/ in unstressed function words (''h-dropping'')?', '{"A":"Hello pronounced /eləʊ/","B":"''Tell him'' pronounced /tel ɪm/","C":"House pronounced /aʊs/","D":"Honest pronounced /ɒnɪst/"}'::jsonb, '"B"', 'Unstressed pronouns ''he/him/her/his'' often lose their /h/ in connected speech: ''tell him'' becomes /tel ɪm/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which word ends with a voiceless consonant cluster that is often simplified in fast speech?', '{"A":"Asked","B":"Open","C":"Going","D":"Apple"}'::jsonb, '"A"', '''Asked'' ends in /skt/ — a complex cluster that natives often simplify (e.g. dropping the medial /k/).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which compound noun is stressed on the FIRST element (typical pattern)?', '{"A":"GREENhouse (a glass building for plants)","B":"green HOUSE (a house painted green)","C":"BLACKboard versus blackBOARD","D":"Both A and C show first-element stress for compounds"}'::jsonb, '"D"', 'Compound nouns (single concept) typically stress the first element (''GREENhouse'', ''BLACKboard''); adjective+noun phrases stress the noun.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which transcription correctly shows the weak form of ''and'' in connected speech?', '{"A":"/ænd/","B":"/ɑːnd/","C":"/ən/ or /n̩/","D":"/eənd/"}'::jsonb, '"C"', '''And'' is typically reduced to /ən/ or syllabic /n̩/ in connected speech (''fish ''n'' chips'').');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'What sound change occurs in ''don''t you'' becoming /dəʊntʃu/?', '{"A":"Elision","B":"Coalescent assimilation (yod-coalescence)","C":"Aspiration","D":"Vowel reduction"}'::jsonb, '"B"', 'Yod-coalescence: /t/ + /j/ merges into /tʃ/. The same happens in ''did you'' → /dɪdʒu/ with /d/ + /j/ → /dʒ/.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which word has ''tertiary'' or secondary stress before its primary stress?', '{"A":"Open","B":"Pronunciation","C":"Easy","D":"Window"}'::jsonb, '"B"', '''Pronunciation'' has secondary stress on ''pro-'' and primary stress on ''-A-'' (pro-nun-ci-A-tion); the others have only one stress.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which feature is most strongly associated with English being a ''stress-timed'' language?', '{"A":"Each syllable takes equal time","B":"Stressed syllables occur at roughly regular intervals; unstressed ones compress","C":"All syllables receive equal stress","D":"Intonation never varies"}'::jsonb, '"B"', 'In stress-timed languages like English, the rhythm is governed by stressed syllables occurring at regular intervals, with unstressed syllables compressed between them.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'PRONUNCIATION', 'ADVANCED', 'MCQ', 'Which sentence would most naturally take a fall-rise intonation to imply ''but…''?', '{"A":"I LIKE it. (and that''s all)","B":"I LIKE it ↘↗ (but there''s a problem)","C":"I LIKE it? (asking)","D":"I LIKE IT! (exclaiming)"}'::jsonb, '"B"', 'Fall-rise intonation in English typically signals reservation, contrast or implication — that something more (often negative) is left unsaid.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which is a natural way to start describing your hometown?', '{"A":"My hometown is a place.","B":"I''m from a small town in the north.","C":"Hometown.","D":"Town me."}'::jsonb, '"B"', 'A natural opener gives location and basic detail.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the best word: ''My favourite food is ___.''', '{"A":"yummy","B":"pizza","C":"big","D":"red"}'::jsonb, '"B"', 'You should name a specific food.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Pick the most natural word for hot weather.', '{"A":"warm","B":"boiling","C":"freezing","D":"cool"}'::jsonb, '"B"', '''Boiling'' is a strong, natural way to describe very hot weather.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which describes a happy person?', '{"A":"upset","B":"cheerful","C":"angry","D":"tired"}'::jsonb, '"B"', '''Cheerful'' is a positive synonym for happy.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the right word: ''I love ___ books.''', '{"A":"reading","B":"read","C":"to read","D":"both A and C are acceptable"}'::jsonb, '"D"', '''Love reading'' (gerund) and ''love to read'' (infinitive) are both natural in spoken English.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which word describes a person who likes to talk to others?', '{"A":"shy","B":"quiet","C":"sociable","D":"angry"}'::jsonb, '"C"', '''Sociable'' means outgoing and friendly.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Pick the natural phrase: ''I''m really ___ cooking.''', '{"A":"into","B":"on","C":"at","D":"of"}'::jsonb, '"A"', '''Be into something'' is common spoken English for showing interest.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which describes feeling very tired?', '{"A":"sleepy","B":"exhausted","C":"awake","D":"happy"}'::jsonb, '"B"', '''Exhausted'' means very tired.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the natural answer: ''Did you have fun?''', '{"A":"Yes, very fun.","B":"Yes, I had a great time!","C":"Funny yes.","D":"Yes me fun."}'::jsonb, '"B"', '''I had a great time'' is the natural full answer.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Pick the right word: ''My best friend is very ___.''', '{"A":"funny","B":"car","C":"red","D":"tomorrow"}'::jsonb, '"A"', '''Funny'' (an adjective for personality) fits.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which best describes a beach?', '{"A":"sandy","B":"snowy","C":"icy","D":"forested"}'::jsonb, '"A"', 'Beaches are typically ''sandy''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the right word: ''I usually wake up ___ 7am.''', '{"A":"in","B":"on","C":"at","D":"by"}'::jsonb, '"C"', '''At'' is used with specific clock times.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Pick the natural phrase: ''In my ___ time, I read books.''', '{"A":"empty","B":"full","C":"free","D":"long"}'::jsonb, '"C"', '''Free time'' = leisure time.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which is a natural answer to ''How was your weekend?''', '{"A":"Weekend.","B":"It was great, thanks!","C":"Yes weekend.","D":"Weekend yes."}'::jsonb, '"B"', 'A natural conversational reply.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the right word for transportation: ''I take the ___ to work.''', '{"A":"bus","B":"book","C":"food","D":"chair"}'::jsonb, '"A"', 'You take a ''bus'' as transport.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which describes someone who is good at sports?', '{"A":"clever","B":"athletic","C":"loud","D":"old"}'::jsonb, '"B"', '''Athletic'' describes physical ability for sports.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Pick the natural opener: ''When I was a child, ___''', '{"A":"I love play.","B":"I used to play outside a lot.","C":"I plays.","D":"Played me."}'::jsonb, '"B"', '''I used to'' is natural for past habits.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the best word: ''My mother is very ___.''', '{"A":"kind","B":"car","C":"door","D":"loud sleep"}'::jsonb, '"A"', '''Kind'' is a personality adjective.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which describes a quiet, peaceful place?', '{"A":"noisy","B":"calm","C":"crowded","D":"busy"}'::jsonb, '"B"', '''Calm'' suggests quiet and peaceful.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Pick the natural phrase: ''I''m looking ___ to the holiday.''', '{"A":"in","B":"at","C":"forward","D":"on"}'::jsonb, '"C"', '''Look forward to'' = anticipate with pleasure.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which idiom fits: ''I''ll have to ___ my exams next week.''', '{"A":"sit","B":"stand","C":"do","D":"have"}'::jsonb, '"A"', '''Sit an exam'' is a natural collocation in British English.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the natural phrase: ''I get ___ very well with my colleagues.''', '{"A":"on","B":"in","C":"out","D":"by"}'::jsonb, '"A"', '''Get on (with)'' = have a good relationship.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the natural expression: ''It''s ___ a hot day today!''', '{"A":"so","B":"such","C":"too","D":"very much"}'::jsonb, '"B"', '''Such + (adj +) noun'' is natural for emphasis.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which fits: ''I was on ___ yesterday and felt better today.''', '{"A":"top of the world","B":"cloud nine","C":"the mend","D":"a roll"}'::jsonb, '"C"', '''On the mend'' = recovering from illness.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the natural collocation: ''I ___ a decision quickly.''', '{"A":"do","B":"make","C":"take","D":"have"}'::jsonb, '"B"', '''Make a decision'' is the standard collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the appropriate phrase: ''I''m ___ working on this project.''', '{"A":"highly","B":"deeply","C":"currently","D":"hardly"}'::jsonb, '"C"', '''Currently'' = at the present time.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which expression means ''be honest''?', '{"A":"hit the books","B":"bite the bullet","C":"come clean","D":"cut corners"}'::jsonb, '"C"', '''Come clean'' = tell the truth.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the natural phrase: ''I''m a bit ___ of meeting new people.''', '{"A":"nervous","B":"angry","C":"happy","D":"hungry"}'::jsonb, '"A"', '''Nervous of/about'' fits the social context.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the best phrase: ''It was a ___ experience I''ll never forget.''', '{"A":"unforgettable","B":"forgettable","C":"forgettable, no","D":"forgetting"}'::jsonb, '"A"', '''Unforgettable experience'' is a natural collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which idiom means ''very expensive''?', '{"A":"a piece of cake","B":"costs an arm and a leg","C":"under the weather","D":"break a leg"}'::jsonb, '"B"', '''Costs an arm and a leg'' = is very expensive.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the natural phrase: ''I find it ___ to wake up early.''', '{"A":"hardly","B":"difficult","C":"hard time","D":"hardish"}'::jsonb, '"B"', '''Find it difficult to + verb'' is the standard pattern.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the best phrasal verb: ''Could you ___ the radio? It''s too loud.''', '{"A":"turn down","B":"turn up","C":"turn off in","D":"turn over"}'::jsonb, '"A"', '''Turn down'' = lower volume.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which is a natural opener for an opinion?', '{"A":"Just say.","B":"From my point of view,","C":"Tell.","D":"Look at me."}'::jsonb, '"B"', '''From my point of view'' politely introduces a personal opinion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the best phrase: ''I''d ___ stay home tonight.''', '{"A":"like","B":"rather","C":"prefer","D":"better"}'::jsonb, '"B"', '''I''d rather'' + base form expresses preference.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the right collocation: ''___ a good time''.', '{"A":"do","B":"have","C":"make","D":"take"}'::jsonb, '"B"', '''Have a good time'' is the standard collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which expression means ''extremely easy''?', '{"A":"a piece of cake","B":"a lemon","C":"a hot potato","D":"a wet blanket"}'::jsonb, '"A"', '''A piece of cake'' = very easy.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the right phrasal verb: ''I usually ___ at 7am.''', '{"A":"wake up","B":"wake on","C":"wake in","D":"wake to"}'::jsonb, '"A"', '''Wake up'' is the standard phrasal verb for getting up from sleep.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the natural phrase: ''It really ___ on the weather.''', '{"A":"depends","B":"counts","C":"believes","D":"hangs"}'::jsonb, '"A"', '''Depend on'' is the correct collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which is the best phrase: ''I''m a strong ___ of solar energy.''', '{"A":"liker","B":"supporter","C":"helper","D":"friend"}'::jsonb, '"B"', '''A supporter of'' (a cause/idea) is the natural collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the right idiom: ''I have a lot ___ at the moment.''', '{"A":"on my mind","B":"on my head","C":"on my hand","D":"on my eye"}'::jsonb, '"A"', '''A lot on my mind'' = many things to think about.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which collocation is most natural for IELTS Speaking Part 3 discussions of social trends?', '{"A":"trends are happening","B":"trends are emerging","C":"trends do come","D":"trends arrive"}'::jsonb, '"B"', '''Trends are emerging'' is a sophisticated, natural collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the most precise idiom: ''The new policy is ___ for the country''s economy.''', '{"A":"a piece of cake","B":"a double-edged sword","C":"a hot potato","D":"a walk in the park"}'::jsonb, '"B"', '''A double-edged sword'' = something with both positive and negative aspects.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the most polished phrase: ''I would say it''s a ___ issue.''', '{"A":"difficult","B":"complex","C":"multifaceted","D":"hard"}'::jsonb, '"C"', '''Multifaceted'' is sophisticated and precise for nuanced issues.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which advanced phrase fits: ''The advantages of remote work ___ the disadvantages.''', '{"A":"are more than","B":"outweigh","C":"win over","D":"overcome"}'::jsonb, '"B"', '''Outweigh'' is the precise verb in this context.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the most idiomatic expression: ''I''m ___ regarding my career path.''', '{"A":"at a crossroads","B":"on a crossroad","C":"in a cross","D":"across the road"}'::jsonb, '"A"', '''At a crossroads'' = at a critical decision point.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the most refined response: ''I think this issue requires ___ consideration.''', '{"A":"big","B":"long","C":"careful","D":"hard"}'::jsonb, '"C"', '''Careful consideration'' is the natural collocation for thoughtful reflection.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which collocation fits: ''The findings ___ light on the issue.''', '{"A":"give","B":"shed","C":"throw out","D":"do"}'::jsonb, '"B"', '''Shed light on'' = clarify or illuminate; sophisticated collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the best idiom for beating expectations: ''The product has ___''', '{"A":"taken off","B":"fallen down","C":"come back","D":"set in"}'::jsonb, '"A"', '''Take off'' = become very successful very quickly.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the most precise word: ''The two opinions are ___ opposed.''', '{"A":"deeply","B":"hardly","C":"diametrically","D":"highly"}'::jsonb, '"C"', '''Diametrically opposed'' = completely opposite — fixed advanced collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which advanced phrase fits: ''___ in the healthcare system are urgently needed.''', '{"A":"Big changes","B":"Sweeping reforms","C":"Some things","D":"Many people"}'::jsonb, '"B"', '''Sweeping reforms'' is a polished collocation for major systemic change.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the most idiomatic phrase: ''The economy is ___ a difficult period.''', '{"A":"going through","B":"running into","C":"coming on","D":"jumping over"}'::jsonb, '"A"', '''Going through (a difficult period)'' = experiencing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the most refined opener for a complex opinion: ''___, the issue is more nuanced than it appears.''', '{"A":"In short","B":"Frankly speaking","C":"At the end of the day","D":"For real"}'::jsonb, '"B"', '''Frankly speaking'' is a sophisticated discourse marker.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which precise collocation fits: ''The reform faces ___ opposition.''', '{"A":"big","B":"hot","C":"fierce","D":"long"}'::jsonb, '"C"', '''Fierce opposition'' is the natural advanced collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the best phrase: ''It''s a ___ improvement over the previous version.''', '{"A":"big","B":"lot of","C":"marked","D":"loud"}'::jsonb, '"C"', '''Marked improvement'' = noticeable and significant; advanced collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the most idiomatic phrasing: ''He ___ his position on the matter.''', '{"A":"changed","B":"reversed","C":"backtracked on","D":"took"}'::jsonb, '"C"', '''Backtrack on'' = reverse a previous position; idiomatic advanced phrasing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which is the most polished synonym of ''show'': ''The data ___ a clear pattern.''', '{"A":"reveals","B":"sees","C":"shows out","D":"makes"}'::jsonb, '"A"', '''Reveal'' is appropriate sophisticated lexis for academic discussion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the most precise word for ''finally accepting'': ''After much resistance, he ___ to the new policy.''', '{"A":"agreed","B":"acquiesced","C":"jumped","D":"decided"}'::jsonb, '"B"', '''Acquiesce'' = reluctantly accept; advanced lexis.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the most natural advanced collocation: ''The two events are ___ linked.''', '{"A":"deeply","B":"highly","C":"inextricably","D":"highest"}'::jsonb, '"C"', '''Inextricably linked'' = impossible to separate; advanced collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which idiom means ''fully understanding the situation''?', '{"A":"in the loop","B":"out of the blue","C":"on the fence","D":"under the weather"}'::jsonb, '"A"', '''In the loop'' = informed and aware.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('SPEAKING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the most refined phrase for a Speaking Part 3 answer: ''It would ___ on a number of factors.''', '{"A":"depend","B":"hinge","C":"hang","D":"all of these are acceptable"}'::jsonb, '"D"', '''Depend on'', ''hinge on'', and ''hang on'' are all natural advanced alternatives meaning ''be conditional on''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Choose the best linking word: ''It was raining, ___ we stayed indoors.''', '{"A":"and","B":"so","C":"but","D":"or"}'::jsonb, '"B"', '''So'' shows the result/consequence of the rain.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Which word best joins these ideas: ''I like tea ___ I prefer coffee.''', '{"A":"so","B":"but","C":"because","D":"if"}'::jsonb, '"B"', '''But'' shows contrast between the two preferences.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Pick the best opener for the second sentence: ''I went to the shop. ___, it was closed.''', '{"A":"And","B":"However","C":"Because","D":"For example"}'::jsonb, '"B"', '''However'' signals the unexpected contrast.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Choose the correct linker: ''I was tired, ___ I went to bed early.''', '{"A":"although","B":"because","C":"so","D":"unless"}'::jsonb, '"C"', '''So'' indicates result.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Which best fits: ''First, mix the eggs. ___, add the flour.''', '{"A":"However","B":"Then","C":"Because","D":"But"}'::jsonb, '"B"', '''Then'' indicates the next step in a sequence.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Choose the right linking word: ''I will go ___ it is sunny.''', '{"A":"if","B":"so","C":"but","D":"or"}'::jsonb, '"A"', '''If'' introduces a condition.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Pick the best connector: ''She studied hard, ___ she passed the exam.''', '{"A":"but","B":"and","C":"because","D":"or"}'::jsonb, '"B"', '''And'' joins two related positive outcomes.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Which word completes the contrast: ''He is rich, ___ he is not happy.''', '{"A":"so","B":"and","C":"but","D":"because"}'::jsonb, '"C"', '''But'' marks the contrast between wealth and unhappiness.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Choose the linker: ''I like apples, oranges, ___ bananas.''', '{"A":"but","B":"and","C":"so","D":"or"}'::jsonb, '"B"', '''And'' joins items in a list.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Pick the best transition: ''I want to lose weight. ___, I started exercising.''', '{"A":"However","B":"Therefore","C":"Although","D":"Otherwise"}'::jsonb, '"B"', '''Therefore'' shows that exercising follows from the goal.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Choose the connector: ''You should leave now ___ you will be late.''', '{"A":"and","B":"or","C":"but","D":"so"}'::jsonb, '"B"', '''Or'' presents an alternative consequence.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Which best fits: ''I love summer ___ I can swim outside.''', '{"A":"but","B":"because","C":"so","D":"or"}'::jsonb, '"B"', '''Because'' provides a reason.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Pick the best opener: ''I have many hobbies. ___, I love reading.''', '{"A":"However","B":"For example","C":"Because","D":"In conclusion"}'::jsonb, '"B"', '''For example'' introduces an illustration.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Choose the linker: ''It was late, ___ I decided to go home.''', '{"A":"because","B":"although","C":"so","D":"unless"}'::jsonb, '"C"', '''So'' connects the cause (late) and decision.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Which best concludes: ''I have explained the reasons. ___, I support the plan.''', '{"A":"For example","B":"In conclusion","C":"However","D":"First"}'::jsonb, '"B"', '''In conclusion'' signals the closing point.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Pick the best word: ''I will go to the park ___ the weather is nice.''', '{"A":"if","B":"so","C":"but","D":"and"}'::jsonb, '"A"', '''If'' sets a condition.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Choose the connector: ''She was hungry, ___ she made a sandwich.''', '{"A":"so","B":"but","C":"or","D":"although"}'::jsonb, '"A"', '''So'' shows the cause-effect relationship.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Which best opens a contrast: ''Cars are convenient. ___, they pollute.''', '{"A":"Therefore","B":"For example","C":"However","D":"Finally"}'::jsonb, '"C"', '''However'' signals a contrasting drawback.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Pick the linker: ''I bought milk, eggs, ___ bread.''', '{"A":"so","B":"and","C":"but","D":"because"}'::jsonb, '"B"', '''And'' joins items in a list.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'BEGINNER', 'MCQ', 'Choose the connector: ''He is young ___ very experienced.''', '{"A":"but","B":"because","C":"so","D":"if"}'::jsonb, '"A"', '''But'' marks contrast (young vs. experienced).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Which connector best fits: ''The plan is risky; ___, it may yield high rewards.''', '{"A":"therefore","B":"furthermore","C":"nevertheless","D":"thus"}'::jsonb, '"C"', '''Nevertheless'' acknowledges the risk while introducing the positive aspect.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Pick the best transition: ''Many factors influence health. ___, diet plays a key role.''', '{"A":"In particular","B":"On the other hand","C":"In contrast","D":"Otherwise"}'::jsonb, '"A"', '''In particular'' singles out one specific factor for emphasis.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Choose the most appropriate linker: ''Sales increased; ___, profits grew.''', '{"A":"however","B":"consequently","C":"nonetheless","D":"otherwise"}'::jsonb, '"B"', '''Consequently'' shows direct cause and effect.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Which sentence has better cohesion?', '{"A":"The car is fast. The car is red. The car is mine.","B":"My car is fast and red.","C":"Fast car, my red car, this car.","D":"A car red and fast belongs to me indeed."}'::jsonb, '"B"', 'Combining short repetitive sentences into one fluent sentence improves cohesion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Pick the best transition: ''The new law has many supporters. ___, critics raise valid concerns.''', '{"A":"Likewise","B":"In addition","C":"On the other hand","D":"Therefore"}'::jsonb, '"C"', '''On the other hand'' introduces a contrasting view.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Which best continues a paragraph about benefits: ''Public transport reduces traffic. ___, it cuts pollution.''', '{"A":"However","B":"Moreover","C":"In contrast","D":"Although"}'::jsonb, '"B"', '''Moreover'' adds another supporting benefit.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Choose the most cohesive sequence: ''First we surveyed users. ___, we analysed the data.''', '{"A":"Finally","B":"Then","C":"However","D":"Because"}'::jsonb, '"B"', '''Then'' indicates the next step in a process.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Pick the best linker: ''He missed the deadline ___ a personal emergency.''', '{"A":"because","B":"due to","C":"so","D":"although"}'::jsonb, '"B"', '''Due to'' introduces a noun phrase as the cause.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Which sentence best concludes a body paragraph?', '{"A":"I think this is right.","B":"In short.","C":"Thus, regular exercise clearly improves mental health.","D":"Therefore exercise."}'::jsonb, '"C"', 'A clear concluding sentence summarises the main point with a transitional word.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Choose the best connector: ''The findings are preliminary; ___, further research is needed.''', '{"A":"as such","B":"but","C":"so that","D":"although"}'::jsonb, '"A"', '''As such'' signals a logical consequence based on the preceding statement.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Pick the best word for a contrast: ''Some argue technology improves life; ___, others disagree.''', '{"A":"furthermore","B":"however","C":"thus","D":"because"}'::jsonb, '"B"', '''However'' introduces an opposing viewpoint.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Which is the best topic-sentence opener?', '{"A":"I will now write about pollution.","B":"Air pollution poses a serious threat to public health.","C":"This essay is about pollution.","D":"Pollution thing."}'::jsonb, '"B"', 'A strong topic sentence states the main point clearly without meta-commentary.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Choose the best linker: ''The product is affordable; ___, it is reliable.''', '{"A":"however","B":"yet","C":"in addition","D":"because"}'::jsonb, '"C"', '''In addition'' adds a related positive attribute.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Pick the most appropriate transition: ''Rural areas have lower wages. ___, the cost of living is also lower.''', '{"A":"Therefore","B":"On the other hand","C":"For instance","D":"In contrast"}'::jsonb, '"B"', '''On the other hand'' balances the negative point with a counter-positive.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Which best fits: ''Many students struggle with maths. ___, this issue requires attention.''', '{"A":"Otherwise","B":"Clearly","C":"For example","D":"Although"}'::jsonb, '"B"', '''Clearly'' signals the writer''s evaluative stance.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Choose the most natural transition: ''He arrived at the airport early. ___, his flight was delayed.''', '{"A":"As a result","B":"Unfortunately","C":"Likewise","D":"In addition"}'::jsonb, '"B"', '''Unfortunately'' conveys the unwanted twist effectively.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Pick the best linker: ''The committee agreed on the budget. ___, they postponed the vote.''', '{"A":"Even so","B":"Therefore","C":"Hence","D":"In conclusion"}'::jsonb, '"A"', '''Even so'' indicates concession despite the agreement.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Which best signals an example: ''Many animals are endangered, ___ tigers and pandas.''', '{"A":"however","B":"such as","C":"in addition","D":"although"}'::jsonb, '"B"', '''Such as'' introduces specific examples.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Choose the best connector: ''Modern cities face overcrowding; ___, housing has become unaffordable.''', '{"A":"as a result","B":"on the contrary","C":"in spite of","D":"although"}'::jsonb, '"A"', '''As a result'' signals the consequence of overcrowding.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'INTERMEDIATE', 'MCQ', 'Pick the most cohesive option: ''Renewable energy reduces emissions. ___, it creates jobs.''', '{"A":"On the contrary","B":"Equally important,","C":"Nevertheless","D":"On the other hand"}'::jsonb, '"B"', '''Equally important'' adds a parallel benefit with appropriate emphasis.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Which transition best emphasises a counterintuitive result: ''Despite increased funding, outcomes worsened; ___, money alone cannot solve the issue.''', '{"A":"in addition","B":"thus","C":"counterintuitively","D":"therefore"}'::jsonb, '"C"', '''Counterintuitively'' (or ''paradoxically'') marks an outcome contrary to expectation; though ''thus'' could fit, the more nuanced answer is the cohesive marker that introduces a contrary-to-expectation reading.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Choose the linker that best signals reformulation: ''The minister was evasive; ___, she failed to answer the question.''', '{"A":"in other words","B":"on the contrary","C":"in addition","D":"as a result"}'::jsonb, '"A"', '''In other words'' restates the prior idea more explicitly.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Pick the best connector for nuanced concession: ''___ the methodology has limitations, the findings remain valuable.''', '{"A":"Granted that","B":"Because","C":"In order that","D":"As long as"}'::jsonb, '"A"', '''Granted that'' formally concedes a point before counter-arguing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Which best fits an academic critique: ''The author oversimplifies the issue; ___, she ignores key counterevidence.''', '{"A":"in particular","B":"by the same token","C":"specifically","D":"notably"}'::jsonb, '"D"', '''Notably'' highlights a particularly significant flaw in a formal register.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Choose the best transition for contrast within a complex argument: ''Critics dismiss the policy as ineffective; ___, supporters cite measurable gains.''', '{"A":"by contrast","B":"likewise","C":"furthermore","D":"as a result"}'::jsonb, '"A"', '''By contrast'' is appropriately formal for juxtaposing opposing positions.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Pick the most precise discourse marker: ''The data is incomplete. ___, conclusions must be tentative.''', '{"A":"Accordingly","B":"Even so","C":"Otherwise","D":"On the contrary"}'::jsonb, '"A"', '''Accordingly'' signals a logically warranted consequence.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Which best opens a new section in academic writing: ''___ the economic impact, the social consequences also warrant consideration.''', '{"A":"Beyond","B":"In addition","C":"Furthermore","D":"Equally,"}'::jsonb, '"A"', '''Beyond X, Y also warrants...'' is a sophisticated way to widen the scope.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Choose the best linker: ''The proposal addresses urban poverty; ___, it overlooks rural hardship.''', '{"A":"that being said","B":"in keeping with","C":"insofar as","D":"hence"}'::jsonb, '"A"', '''That being said'' introduces a qualifying counterpoint without rejecting the prior idea.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Pick the most appropriate cohesive device for academic writing: ''___, the empirical evidence remains inconclusive.''', '{"A":"At the end of the day","B":"All in all","C":"On balance","D":"Long story short"}'::jsonb, '"C"', '''On balance'' is a formal way of summarising weighing of evidence.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Which transition best signals a generalisation drawn from examples: ''Country X has seen falling birth rates; Country Y similarly so. ___, demographic shifts are reshaping policy.''', '{"A":"In particular","B":"More broadly","C":"By contrast","D":"Otherwise"}'::jsonb, '"B"', '''More broadly'' moves from specific cases to a wider trend.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Choose the best connector for stating a corollary: ''The hypothesis is supported by all available data. ___, no further testing is required.''', '{"A":"It follows that","B":"In any case","C":"Even though","D":"Notwithstanding"}'::jsonb, '"A"', '''It follows that'' introduces a logical corollary.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Pick the most cohesive option: ''The reform was popular among the urban middle class. ___, rural communities largely opposed it.''', '{"A":"Conversely","B":"Likewise","C":"In particular","D":"Hence"}'::jsonb, '"A"', '''Conversely'' marks the inverse position.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Which best fits: ''The model assumes rational behaviour; ___, real-world deviations weaken its predictive power.''', '{"A":"thereby","B":"however","C":"as a result","D":"on the contrary"}'::jsonb, '"B"', '''However'' introduces a critical limitation; ''as a result'' would mistakenly suggest rational behaviour itself causes the deviations.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Choose the best linker: ''The argument is logically consistent; ___, it lacks empirical grounding.''', '{"A":"in light of","B":"that said","C":"thereupon","D":"insofar as"}'::jsonb, '"B"', '''That said'' introduces a qualifying counterpoint.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Pick the most appropriate transition: ''These findings challenge prevailing assumptions. ___, they invite reconsideration of established theory.''', '{"A":"As such,","B":"On the contrary","C":"In any event","D":"Otherwise"}'::jsonb, '"A"', '''As such'' signals a consequence based on the preceding characterisation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Which is the best discourse marker for hedging a strong claim: ''Education ___ the most powerful tool for social mobility.''', '{"A":"definitely is","B":"is unequivocally","C":"may arguably be","D":"is for sure"}'::jsonb, '"C"', '''May arguably be'' appropriately hedges in academic writing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Choose the most precise connector: ''Economic growth has stalled. ___, structural reforms appear inevitable.''', '{"A":"Inasmuch as","B":"Given that","C":"Hereby","D":"Whereby"}'::jsonb, '"B"', '''Given that'' establishes a premise from which the conclusion follows.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Pick the best linker for sequenced argument: ''First, the data is unreliable. ___, even if reliable, it does not support the claim.''', '{"A":"Second","B":"Henceforth","C":"Lastly","D":"In addition"}'::jsonb, '"A"', '''Second'' clearly signals the next stage in a structured argument.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Which transition best anticipates a counter-argument: ''___ critics may object that costs are excessive, the long-term benefits justify the expenditure.''', '{"A":"Although","B":"Whilst","C":"Whereas","D":"All of these are acceptable"}'::jsonb, '"D"', '''Although'', ''Whilst'', and ''Whereas'' can all introduce concessive clauses in formal writing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'COHERENCE', 'ADVANCED', 'MCQ', 'Choose the best academic concluding marker: ''___, the evidence demonstrates a clear and consistent pattern.''', '{"A":"To wrap up","B":"In summary","C":"At the end of the day","D":"All things considered"}'::jsonb, '"D"', '''All things considered'' is appropriate for a balanced final assessment in formal writing; ''In summary'' is also acceptable but feels more mechanical.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct sentence.', '{"A":"She go to school every day.","B":"She goes to school every day.","C":"She going to school every day.","D":"She gone to school every day."}'::jsonb, '"B"', 'Third-person singular present-tense verbs take an -s ending: ''She goes''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Select the sentence with correct subject-verb agreement.', '{"A":"The books is on the table.","B":"The books are on the table.","C":"The books am on the table.","D":"The books be on the table."}'::jsonb, '"B"', 'Plural subject ''books'' requires the plural verb ''are''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which sentence uses the correct article?', '{"A":"I saw a elephant at the zoo.","B":"I saw an elephant at the zoo.","C":"I saw the elephant at a zoo.","D":"I saw elephant at the zoo."}'::jsonb, '"B"', 'Use ''an'' before words beginning with a vowel sound (elephant).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct past tense form.', '{"A":"Yesterday I go to the market.","B":"Yesterday I goes to the market.","C":"Yesterday I went to the market.","D":"Yesterday I going to the market."}'::jsonb, '"C"', '''Went'' is the simple past tense of ''go'', appropriate for past time markers like ''yesterday''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Select the correct plural form.', '{"A":"Three childs are playing.","B":"Three childrens are playing.","C":"Three children are playing.","D":"Three child are playing."}'::jsonb, '"C"', '''Children'' is the irregular plural of ''child''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which sentence is correct?', '{"A":"He don''t like coffee.","B":"He doesn''t like coffee.","C":"He not like coffee.","D":"He no like coffee."}'::jsonb, '"B"', 'Third-person singular negation uses ''doesn''t'' (does not).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct preposition: ''I am good ___ English.''', '{"A":"in","B":"on","C":"at","D":"of"}'::jsonb, '"C"', 'The fixed expression is ''good at'' (a skill or activity).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Select the correct sentence.', '{"A":"There is many people here.","B":"There are many people here.","C":"There be many people here.","D":"There am many people here."}'::jsonb, '"B"', '''People'' is plural, so it requires ''are''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct possessive: ''This is ___ book.''', '{"A":"me","B":"my","C":"I","D":"mine"}'::jsonb, '"B"', 'Before a noun, use the possessive adjective ''my''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which is the correct comparative form?', '{"A":"She is more taller than me.","B":"She is taller than me.","C":"She is more tall than me.","D":"She is tallest than me."}'::jsonb, '"B"', 'Short adjectives form the comparative with -er; do not combine with ''more''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct sentence.', '{"A":"I have lived here since five years.","B":"I have lived here for five years.","C":"I am living here for five years ago.","D":"I lived here for five years now."}'::jsonb, '"B"', 'Use ''for'' with a duration of time and ''since'' with a starting point.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Select the correct question form.', '{"A":"Where you are going?","B":"Where are you going?","C":"Where you going?","D":"Where going you are?"}'::jsonb, '"B"', 'In questions, the auxiliary verb (are) comes before the subject (you).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which sentence is grammatically correct?', '{"A":"He can to swim very well.","B":"He cans swim very well.","C":"He can swim very well.","D":"He can swimming very well."}'::jsonb, '"C"', 'Modal verbs like ''can'' are followed by the bare infinitive (no ''to'', no -ing).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct article: ''She is ___ honest person.''', '{"A":"a","B":"an","C":"the","D":"no article"}'::jsonb, '"B"', '''Honest'' begins with a silent ''h'', so the vowel sound requires ''an''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Select the correct adverb form.', '{"A":"She sings beautiful.","B":"She sings beautifully.","C":"She sings beauty.","D":"She singing beautiful."}'::jsonb, '"B"', 'Adverbs modify verbs. ''Beautifully'' is the adverb form of ''beautiful''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which sentence uses the correct verb form?', '{"A":"I am agree with you.","B":"I agree with you.","C":"I am agreeing with you.","D":"I agreed with you now."}'::jsonb, '"B"', '''Agree'' is a stative verb expressing opinion; use simple present, not ''be + agree''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct pronoun: ''My sister and ___ went shopping.''', '{"A":"me","B":"I","C":"myself","D":"mine"}'::jsonb, '"B"', 'As part of the subject of the sentence, use the subject pronoun ''I''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Select the correct sentence.', '{"A":"I have a interesting book.","B":"I have an interesting book.","C":"I have interesting book.","D":"I have the a interesting book."}'::jsonb, '"B"', 'Use ''an'' before the vowel sound at the start of ''interesting''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Which sentence shows correct word order?', '{"A":"She drives a red beautiful car.","B":"She drives a beautiful red car.","C":"She drives red a beautiful car.","D":"She drives a car red beautiful."}'::jsonb, '"B"', 'Adjective order: opinion (beautiful) before colour (red).');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'BEGINNER', 'MCQ', 'Choose the correct future form: ''It ___ rain tomorrow.''', '{"A":"will to","B":"will","C":"going","D":"shall to"}'::jsonb, '"B"', '''Will'' is followed by the bare infinitive of the main verb.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which sentence uses the present perfect correctly?', '{"A":"I have seen that film last week.","B":"I have seen that film already.","C":"I have saw that film twice.","D":"I have been see that film."}'::jsonb, '"B"', 'Present perfect is not used with finished time markers like ''last week''; ''already'' is appropriate.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the correct conditional form: ''If I ___ rich, I would travel the world.''', '{"A":"am","B":"was","C":"were","D":"would be"}'::jsonb, '"C"', 'In second conditional (hypothetical), formal English uses ''were'' for all subjects.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Select the correctly punctuated sentence.', '{"A":"However the weather was bad we went out.","B":"However, the weather was bad, we went out.","C":"However, the weather was bad; we went out.","D":"However the weather was bad; we went out."}'::jsonb, '"C"', 'A semicolon links two independent clauses, and ''However,'' is followed by a comma.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which sentence uses the passive voice correctly?', '{"A":"The cake was ate by the children.","B":"The cake was eaten by the children.","C":"The cake been eaten by the children.","D":"The cake is ate by the children."}'::jsonb, '"B"', 'Passive voice = be + past participle. ''Eaten'' is the past participle of ''eat''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the correct relative pronoun: ''The man ___ called you is my uncle.''', '{"A":"which","B":"whose","C":"who","D":"whom"}'::jsonb, '"C"', '''Who'' refers to a person who is the subject of the relative clause.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Select the sentence with correct reported speech.', '{"A":"She said she is tired.","B":"She said she was tired.","C":"She said that she is being tired.","D":"She said she been tired."}'::jsonb, '"B"', 'When the reporting verb is past (''said''), the reported verb shifts back: ''is'' → ''was''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which sentence uses gerund/infinitive correctly?', '{"A":"I enjoy to swim.","B":"I enjoy swimming.","C":"I enjoy swam.","D":"I enjoy swim."}'::jsonb, '"B"', '''Enjoy'' is followed by a gerund (-ing form), not an infinitive.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the correct sentence.', '{"A":"Despite of the rain, we went hiking.","B":"Despite the rain, we went hiking.","C":"Despite the rain was heavy, we went hiking.","D":"Despite of raining, we went hiking."}'::jsonb, '"B"', '''Despite'' is followed directly by a noun phrase — no ''of'', and no clause.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which sentence shows correct article usage?', '{"A":"The honesty is the best policy.","B":"Honesty is the best policy.","C":"An honesty is the best policy.","D":"Honesty is a best policy."}'::jsonb, '"B"', 'Abstract nouns used in a general sense take no article; superlatives take ''the''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Select the correct form: ''By the time we arrived, the film ___.''', '{"A":"started","B":"had started","C":"has started","D":"was starting"}'::jsonb, '"B"', 'Past perfect (''had started'') describes an action completed before another past action.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the sentence with correct comparison.', '{"A":"This task is more easier than the last one.","B":"This task is easier than the last one.","C":"This task is more easy than the last one.","D":"This task is easiest than the last one."}'::jsonb, '"B"', 'Two-syllable adjectives ending in -y form the comparative with -ier; never double the comparison.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which sentence is correct?', '{"A":"Neither of the answers are correct.","B":"Neither of the answers is correct.","C":"Neither of the answers were correct.","D":"Neither of the answer is correct."}'::jsonb, '"B"', '''Neither'' is singular in formal writing and takes a singular verb.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the correct connector: ''He worked hard; ___, he failed the exam.''', '{"A":"moreover","B":"therefore","C":"nevertheless","D":"because"}'::jsonb, '"C"', '''Nevertheless'' signals contrast — hard work contrasts with the unexpected failure.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Select the correctly formed sentence.', '{"A":"I look forward to hear from you.","B":"I look forward to hearing from you.","C":"I look forward to heard from you.","D":"I look forward hear from you."}'::jsonb, '"B"', 'In ''look forward to'', ''to'' is a preposition followed by a gerund.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which uses the subjunctive correctly?', '{"A":"The teacher insisted that he was on time.","B":"The teacher insisted that he be on time.","C":"The teacher insisted that he is on time.","D":"The teacher insisted that he being on time."}'::jsonb, '"B"', 'After verbs like ''insist'', the subjunctive uses the bare infinitive ''be''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the correct form: ''Not only ___ late, but he also forgot the documents.''', '{"A":"he was","B":"was he","C":"he is","D":"he had"}'::jsonb, '"B"', 'Negative inversion after ''Not only'' requires auxiliary–subject inversion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which sentence correctly uses ''used to''?', '{"A":"I am used to live in cold weather.","B":"I used to living in cold weather.","C":"I am used to living in cold weather.","D":"I used to lived in cold weather."}'::jsonb, '"C"', '''Be used to'' (be accustomed to) + gerund expresses familiarity.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Select the correct sentence.', '{"A":"If I would have known, I would have helped.","B":"If I had known, I would have helped.","C":"If I knew, I would have helped.","D":"If I have known, I would have helped."}'::jsonb, '"B"', 'Third conditional: ''if'' + past perfect, then ''would have'' + past participle.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Which sentence avoids a dangling modifier?', '{"A":"Walking down the street, the trees looked beautiful.","B":"Walking down the street, I thought the trees looked beautiful.","C":"Walking down the street the trees were beautiful.","D":"While walking, the trees looked beautiful to the street."}'::jsonb, '"B"', 'The introductory participle phrase must modify the subject of the main clause; the speaker — not the trees — is walking.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'INTERMEDIATE', 'MCQ', 'Choose the correct quantifier: ''There is ___ traffic on the road today.''', '{"A":"many","B":"few","C":"much","D":"several"}'::jsonb, '"C"', '''Traffic'' is uncountable, so use ''much'' rather than ''many'' or ''few''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence demonstrates correct use of inversion for emphasis?', '{"A":"Rarely I have seen such dedication.","B":"Rarely have I seen such dedication.","C":"Rarely I see such dedication has been.","D":"Rarely seen I have such dedication."}'::jsonb, '"B"', 'Negative adverbials at the start of a sentence trigger subject-auxiliary inversion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Select the sentence with correct use of the subjunctive mood.', '{"A":"It is essential that every student submits the form.","B":"It is essential that every student submit the form.","C":"It is essential that every student submitted the form.","D":"It is essential that every student is submitting the form."}'::jsonb, '"B"', 'After ''It is essential that'', the mandative subjunctive uses the base form of the verb.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence employs correct parallel structure?', '{"A":"She enjoys reading, to swim, and hiking on weekends.","B":"She enjoys to read, to swim, and to hike on weekends.","C":"She enjoys reading, swimming, and hiking on weekends.","D":"She enjoys reading, swam, and hiking on weekends."}'::jsonb, '"C"', 'Parallel structure requires consistent grammatical forms — three gerunds match here.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the sentence with the correct cleft construction.', '{"A":"It was the manager who first identified the problem.","B":"It was the manager whom first identified the problem.","C":"It was the manager which first identified the problem.","D":"It is the manager who first identified the problem yesterday."}'::jsonb, '"A"', 'In an ''it-cleft'' sentence, ''who'' refers to a person acting as the subject of the relative clause.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence uses a participle clause correctly?', '{"A":"Having finished the report, the printer was used.","B":"Having finished the report, she sent it to her supervisor.","C":"Having finished the report, it was sent.","D":"Having finished the report was sent to her supervisor."}'::jsonb, '"B"', 'The implied subject of the participle clause must match the subject of the main clause (''she'').');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Identify the sentence with correct use of the past perfect continuous.', '{"A":"She had been working for hours before she took a break.","B":"She has been working for hours before she took a break.","C":"She had been work for hours before she taking a break.","D":"She had working for hours before she took a break."}'::jsonb, '"A"', 'Past perfect continuous (had been + -ing) expresses an ongoing action prior to another past event.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence uses ''whom'' correctly?', '{"A":"Whom is at the door?","B":"The candidate whom we interviewed yesterday was excellent.","C":"Whom shall be invited to the meeting?","D":"Whom did this?"}'::jsonb, '"B"', '''Whom'' functions as the object of the verb ''interviewed'' in the relative clause.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the correctly hedged academic statement.', '{"A":"The data proves the hypothesis without doubt.","B":"The data suggests that the hypothesis may be valid.","C":"The data is proving the hypothesis.","D":"The data totally confirms everything."}'::jsonb, '"B"', 'Academic writing typically employs hedging language (''suggests'', ''may'') to convey appropriate caution.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence demonstrates correct use of mixed conditionals?', '{"A":"If I had studied medicine, I would be a doctor now.","B":"If I studied medicine, I would have been a doctor now.","C":"If I have studied medicine, I would be a doctor now.","D":"If I had studied medicine, I will be a doctor now."}'::jsonb, '"A"', 'Mixed conditional: past perfect in the if-clause refers to past condition; ''would'' + base form refers to present result.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Select the sentence with correct nominalisation typical of academic prose.', '{"A":"The government decided to reduce taxes, and this caused the economy to grow.","B":"The government''s decision to reduce taxes caused economic growth.","C":"Because government decided reduce taxes economy grew.","D":"Government decision was to reduce taxes for economy growth."}'::jsonb, '"B"', 'Nominalisation condenses clauses into noun phrases, producing more concise academic prose.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence avoids comma splicing?', '{"A":"The rain stopped, the children went outside.","B":"The rain stopped; the children went outside.","C":"The rain stopped the children went outside.","D":"The rain stopped, however the children went outside."}'::jsonb, '"B"', 'Two independent clauses must be joined by a semicolon, a conjunction, or separated into sentences.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the sentence with correct use of ''whereby''.', '{"A":"We have a system whereby data is automatically encrypted.","B":"We have a system whereby of automatic encryption.","C":"We have a system whereby encrypts data.","D":"We have a system whereby encrypt automatic."}'::jsonb, '"A"', '''Whereby'' means ''by means of which'' and introduces a clause describing how something works.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence uses ''lest'' correctly?', '{"A":"She spoke quietly lest she would wake the baby.","B":"She spoke quietly lest she wake the baby.","C":"She spoke quietly lest waking the baby.","D":"She spoke quietly lest she wakes the baby."}'::jsonb, '"B"', '''Lest'' (formal, meaning ''in case'') is followed by the subjunctive base form.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Identify the sentence with correct ellipsis.', '{"A":"I can speak French, and my brother can too.","B":"I can speak French, and my brother can speaks too.","C":"I can speak French, and my brother can speaking too.","D":"I can speak French, and my brother can to speak too."}'::jsonb, '"A"', 'Ellipsis omits the predicate after the auxiliary; ''can'' alone is sufficient.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence demonstrates correct use of a non-defining relative clause?', '{"A":"My brother who lives in Paris is visiting next week.","B":"My brother, who lives in Paris, is visiting next week.","C":"My brother, that lives in Paris, is visiting next week.","D":"My brother which lives in Paris, is visiting next week."}'::jsonb, '"B"', 'Non-defining clauses provide extra information, are set off by commas, and use ''who/which'' (not ''that'').');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the sentence that correctly uses cohesive substitution.', '{"A":"She wanted a red dress; she chose a red dress.","B":"She wanted a red dress; she chose one.","C":"She wanted a red dress; she chose them.","D":"She wanted a red dress; she chose the one of red."}'::jsonb, '"B"', '''One'' substitutes for the previously mentioned countable noun, avoiding repetition.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence uses ''should'' for tentative conditions correctly?', '{"A":"Should you require assistance, please contact reception.","B":"Should you to require assistance, please contact reception.","C":"Should you required assistance, please contact reception.","D":"Should require you assistance, please contact reception."}'::jsonb, '"A"', 'Inversion with ''should'' creates a formal first-conditional; verb stays in base form.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Select the sentence with correct concessive structure.', '{"A":"Although being tired, she finished the task.","B":"Despite being tired, she finished the task.","C":"Despite she was tired, she finished the task.","D":"Although tired she was, finishing the task."}'::jsonb, '"B"', '''Despite'' is followed by a noun phrase or gerund, not a clause; ''although'' would require a full clause.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Which sentence shows correct use of fronted adverbials?', '{"A":"On no account you should reveal the password.","B":"On no account should you reveal the password.","C":"On no account you reveal the password should.","D":"On no account revealing the password you should."}'::jsonb, '"B"', 'Fronted negative adverbials require subject-auxiliary inversion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'GRAMMAR', 'ADVANCED', 'MCQ', 'Choose the most concise and accurate sentence.', '{"A":"Due to the fact that it was raining, we made the decision to cancel.","B":"Because it was raining, we cancelled.","C":"Owing to the rain that was occurring, the cancellation was made by us.","D":"It was raining and as a consequence we did cancel."}'::jsonb, '"B"', 'Concise academic style avoids redundant phrases like ''due to the fact that'' and ''made the decision to''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'In an essay about advantages of public transport, which sentence best states an advantage?', '{"A":"I take the bus.","B":"Public transport reduces traffic in cities.","C":"I am writing about transport.","D":"Buses are everywhere."}'::jsonb, '"B"', 'A clear advantage statement directly addresses the task.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'For the question ''Do you agree that exercise is important?'', which is the best opening?', '{"A":"I think exercise is okay.","B":"I strongly agree that exercise is important for health.","C":"Exercise.","D":"Maybe exercise sometimes."}'::jsonb, '"B"', 'A clear position must be stated to address an agree/disagree task.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Which sentence best supports the argument that reading is beneficial?', '{"A":"Books exist.","B":"Reading improves vocabulary and knowledge.","C":"I have many books.","D":"Reading is reading."}'::jsonb, '"B"', 'Stating specific benefits supports the argument.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Choose the best example sentence for an essay about healthy food.', '{"A":"Food is good.","B":"Healthy food, such as fruits and vegetables, provides essential vitamins.","C":"I eat food.","D":"Food food food."}'::jsonb, '"B"', 'A specific example with detail addresses the task fully.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Which is the best concluding sentence: ''In conclusion, ___''?', '{"A":"that''s all.","B":"I think exercise is important for everyone.","C":"bye.","D":"end."}'::jsonb, '"B"', 'A conclusion should restate the main view clearly.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'For an essay on protecting the environment, which sentence is most relevant?', '{"A":"I like trees.","B":"We can protect the environment by recycling and reducing waste.","C":"Trees are green.","D":"My city is nice."}'::jsonb, '"B"', 'It directly answers the task by giving solutions.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Which sentence best addresses the task ''Describe your hometown''?', '{"A":"I live in a small town near the mountains.","B":"Towns are everywhere.","C":"It is a town.","D":"Many towns."}'::jsonb, '"A"', 'Provides a clear, specific description.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Choose the best supporting reason in an essay about why students should learn languages.', '{"A":"It is good.","B":"Learning languages opens up career opportunities and helps when travelling.","C":"Languages.","D":"Some people learn."}'::jsonb, '"B"', 'Provides specific, relevant reasons that address the task.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Which sentence stays on topic if the essay is about benefits of sports?', '{"A":"Sports help children develop teamwork skills.","B":"I have a dog.","C":"My favourite food is pizza.","D":"It rains a lot."}'::jsonb, '"A"', 'Only option A is on the topic of sports benefits.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'For ''Should children use mobile phones?'', which response shows a clear position?', '{"A":"Maybe yes maybe no.","B":"I believe children should not use mobile phones at school.","C":"Phones exist.","D":"I have a phone."}'::jsonb, '"B"', 'A clear opinion is essential for opinion essays.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Which sentence gives a personal example for an essay on travelling?', '{"A":"Travelling is fun.","B":"When I visited Japan last summer, I learned about a new culture.","C":"People travel.","D":"Travel."}'::jsonb, '"B"', 'Personal example with specific details supports the discussion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Pick the best answer to ''What are the benefits of learning a musical instrument?''', '{"A":"Music is loud.","B":"Learning music improves memory and creativity.","C":"I have a piano.","D":"Music exists."}'::jsonb, '"B"', 'Specific benefits address the task directly.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Which sentence is irrelevant to an essay about healthy eating?', '{"A":"Vegetables provide vitamins.","B":"Junk food contains too much sugar.","C":"My favourite movie is action.","D":"Whole grains are nutritious."}'::jsonb, '"C"', 'A movie preference is unrelated to healthy eating.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Choose the best opening sentence for an essay on climate change.', '{"A":"It rains.","B":"Climate change is one of the biggest challenges today.","C":"Weather is weather.","D":"Cold."}'::jsonb, '"B"', 'A strong opening introduces the topic and signals importance.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Which best supports ''Reading is more useful than watching TV''?', '{"A":"TV is loud.","B":"Reading helps build vocabulary and concentration.","C":"I like both.","D":"TV is fun."}'::jsonb, '"B"', 'Provides a specific reason supporting the comparison.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'For ''Do you prefer city or country life?'' which is the best answer?', '{"A":"Both are the same.","B":"I prefer country life because it is quieter and has cleaner air.","C":"Cities exist.","D":"I don''t know."}'::jsonb, '"B"', 'A clear preference plus a reason answers the task.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Which sentence is most useful in an essay about saving water?', '{"A":"Water is wet.","B":"Turning off the tap when brushing teeth saves water.","C":"I drink water.","D":"Rivers are big."}'::jsonb, '"B"', 'Practical advice directly addresses the task.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Choose the best response to ''Why is education important?''', '{"A":"School exists.","B":"Education gives people knowledge and better job opportunities.","C":"I went to school.","D":"Books are heavy."}'::jsonb, '"B"', 'Provides clear reasons addressing the question.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Which is the most relevant body sentence for an essay on the importance of family?', '{"A":"Cars are useful.","B":"Family members support each other emotionally and financially.","C":"I have a phone.","D":"Buses run on time."}'::jsonb, '"B"', 'Directly addresses the importance of family.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'BEGINNER', 'MCQ', 'Choose the best closing line for a short essay on hobbies.', '{"A":"Bye.","B":"Hobbies make life enjoyable and help us relax.","C":"That''s it.","D":"Hobbies."}'::jsonb, '"B"', 'A meaningful concluding statement summarises the value of hobbies.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'For ''Some say technology isolates people. Discuss both views.'' Which is the best opening of body paragraph 2?', '{"A":"Technology is bad.","B":"On the other hand, technology also enables meaningful connections across distances.","C":"I disagree with everything.","D":"Phones are everywhere."}'::jsonb, '"B"', 'For ''discuss both views'', body 2 should present the opposing perspective with a clear transition.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Choose the most relevant supporting detail for ''Online learning has many advantages.''', '{"A":"Computers are expensive.","B":"It allows students to study at their own pace, accommodating different learning styles.","C":"I like school.","D":"The internet is vast."}'::jsonb, '"B"', 'Specific, on-topic support strengthens the argument.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'For ''Government should fund the arts.'' Which best supports the argument?', '{"A":"Money is useful.","B":"Funded arts programmes preserve cultural heritage and stimulate tourism revenue.","C":"Painters paint.","D":"Concerts are loud."}'::jsonb, '"B"', 'Two concrete benefits provide strong, relevant support.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Which thesis statement best addresses ''Some believe homework should be banned. Do you agree?''', '{"A":"Homework exists.","B":"While homework can be stressful, I believe it remains essential for reinforcing classroom learning.","C":"I''m not sure.","D":"Homework is bad."}'::jsonb, '"B"', 'A clear position with acknowledgement of the opposing view shows balanced engagement.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Pick the best concluding sentence for an essay arguing that working from home is beneficial.', '{"A":"That''s my opinion.","B":"Overall, remote work offers flexibility and productivity gains that benefit both employees and employers.","C":"Work is work.","D":"I work from home."}'::jsonb, '"B"', 'It restates the position and summarises the main benefits.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Choose the most relevant counter-argument for an essay supporting renewable energy.', '{"A":"It is good.","B":"Critics argue that renewable energy is currently more expensive than fossil fuels, though costs are falling.","C":"Solar panels exist.","D":"Wind blows."}'::jsonb, '"B"', 'A balanced essay acknowledges and addresses opposing views.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'For ''Discuss the impact of social media on youth'', which sentence best frames the discussion?', '{"A":"Social media is everywhere.","B":"Social media has profoundly reshaped how young people communicate, both positively and negatively.","C":"Teens use phones.","D":"Apps are popular."}'::jsonb, '"B"', 'It introduces the dual nature of impact, framing balanced discussion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Pick the best example for ''Tourism affects local economies.''', '{"A":"Tourists travel.","B":"In Bali, tourism contributes over 60% of regional GDP, creating thousands of jobs.","C":"Tourism is fun.","D":"Beaches are nice."}'::jsonb, '"B"', 'A specific, factual example strengthens the argument.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Which response best fully addresses ''What are the causes and solutions of urban pollution?''', '{"A":"Cities are dirty.","B":"Vehicle emissions and industrial waste cause pollution; investing in public transport and stricter regulations can address it.","C":"Pollution exists.","D":"Cities have problems."}'::jsonb, '"B"', 'It addresses both causes and solutions, as the task requires.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Choose the best supporting paragraph topic for ''Children should learn financial skills at school.''', '{"A":"Money is paper.","B":"Early financial education helps young people avoid debt and make informed choices later in life.","C":"Schools are big.","D":"Children play."}'::jsonb, '"B"', 'A clear topic sentence presents one focused supporting reason.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'For ''Some argue museums should be free. Do you agree?'', which is the best partial-agreement thesis?', '{"A":"I agree fully.","B":"While free entry promotes access, charging modest fees can help maintain collection quality.","C":"Museums are old.","D":"I have no opinion."}'::jsonb, '"B"', 'A nuanced thesis acknowledges complexity and stakes a balanced position.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Pick the best evidence for ''Vaccines have saved millions of lives.''', '{"A":"Doctors give shots.","B":"The eradication of smallpox in 1980 is widely cited as one of public health''s greatest achievements.","C":"Vaccines are popular.","D":"Hospitals exist."}'::jsonb, '"B"', 'A specific historical example provides credible support.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Choose the best topic sentence for a paragraph about the disadvantages of cars.', '{"A":"Cars exist.","B":"Despite their convenience, cars contribute significantly to air pollution and traffic congestion.","C":"Roads are long.","D":"I drive."}'::jsonb, '"B"', 'It clearly introduces specific drawbacks the paragraph will discuss.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Which sentence best addresses both parts of ''Some think exams are the best assessment, others prefer coursework. Discuss both.''', '{"A":"I prefer one.","B":"Exams test recall under pressure, while coursework rewards sustained effort and creativity.","C":"School is hard.","D":"Tests exist."}'::jsonb, '"B"', 'It captures the strengths of both views, suiting a ''discuss both'' task.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Pick the best paragraph closing for an argument supporting longer maternity leave.', '{"A":"That''s it.","B":"For these reasons, extended maternity leave benefits both family wellbeing and child development.","C":"Babies are cute.","D":"Mothers exist."}'::jsonb, '"B"', 'It closes the paragraph by tying reasons to the main claim.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Choose the most balanced response for ''Should fast food be taxed more heavily?''', '{"A":"Yes, definitely.","B":"Higher taxes could reduce consumption, though they may disproportionately burden low-income households.","C":"No way.","D":"Maybe."}'::jsonb, '"B"', 'It presents a benefit alongside a valid concern, showing critical thinking.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Which is the best supporting sentence for ''Public libraries remain important in the digital age''?', '{"A":"Books are everywhere.","B":"Libraries provide free access to information and digital resources for those without home internet.","C":"I read books.","D":"Libraries are quiet."}'::jsonb, '"B"', 'It identifies a specific, contemporary value.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'For ''Some say capital punishment deters crime. Discuss.'' which best opens the counterview?', '{"A":"I disagree.","B":"However, research consistently fails to demonstrate a clear deterrent effect.","C":"Crime is bad.","D":"Punishment exists."}'::jsonb, '"B"', 'It cites evidence-based reasoning to introduce the opposing view.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Pick the most appropriate closing for an essay on the value of volunteering.', '{"A":"Volunteering rocks.","B":"Volunteering benefits both communities and individuals, fostering empathy and social cohesion.","C":"I volunteer.","D":"It is good."}'::jsonb, '"B"', 'It summarises mutual benefits in formal language.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'INTERMEDIATE', 'MCQ', 'Which best addresses ''Some believe foreign aid wastes money. Discuss both views and give your opinion.''', '{"A":"Aid is bad.","B":"Although critics highlight inefficiencies, well-targeted aid programmes have demonstrably reduced poverty; on balance, I support continued, accountable investment.","C":"Money is money.","D":"Aid exists."}'::jsonb, '"B"', 'It addresses both views and offers a clear, qualified opinion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'For an IELTS Task 2 ''To what extent do you agree that automation will replace most jobs?'', which thesis demonstrates strongest task response?', '{"A":"I agree completely.","B":"While automation will undoubtedly transform employment, claims of wholesale job replacement overlook the new roles emerging in human-centric domains.","C":"Maybe, maybe not.","D":"Robots are scary."}'::jsonb, '"B"', 'A nuanced ''to what extent'' thesis stakes a clear position while acknowledging complexity — the hallmark of a Band 7+ response.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Pick the body sentence that best demonstrates analytical depth for ''Globalisation has increased inequality. Discuss.''', '{"A":"Rich countries get richer.","B":"While globalisation has lifted hundreds of millions out of poverty, the gains have been distributed unevenly, with low-skilled workers in advanced economies bearing disproportionate adjustment costs.","C":"Globalisation is global.","D":"Some people are rich."}'::jsonb, '"B"', 'It demonstrates nuance, qualifies the claim, and identifies specific causal dynamics.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Choose the most sophisticated counter-rebuttal for an essay supporting universal basic income (UBI).', '{"A":"Critics are wrong.","B":"Although critics warn UBI may discourage work, pilot studies in Finland and Kenya found minimal labour-supply reductions, suggesting these concerns are overstated.","C":"UBI is great.","D":"Money helps."}'::jsonb, '"B"', 'It engages the counter-argument with empirical evidence — a hallmark of advanced argumentation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Which thesis best addresses ''Some argue art education is a luxury. To what extent do you agree?''', '{"A":"Art is important.","B":"Far from being a luxury, art education cultivates the creative thinking that increasingly differentiates economies in an automation-driven era.","C":"I disagree.","D":"Art is fun."}'::jsonb, '"B"', 'It refutes the premise and reframes the issue, demonstrating Band 7+ argumentative sophistication.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Pick the best paragraph opener that signals critical engagement for an essay on social media regulation.', '{"A":"Social media is bad.","B":"Proponents of regulation often invoke the spectre of misinformation, yet such arguments must contend with the equally pressing risks of state overreach into legitimate speech.","C":"I think regulation is needed.","D":"Posts spread fast."}'::jsonb, '"B"', 'It engages critically with both sides and uses sophisticated phrasing to frame the analytical tension.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Choose the response that best addresses BOTH parts of ''What are the causes of obesity, and how can governments respond?''', '{"A":"Obesity has causes.","B":"Sedentary lifestyles, ultra-processed diets, and food deserts converge to drive obesity rates; effective responses combine sugar taxes, urban-design reform, and subsidised access to nutritious food.","C":"Obesity is a problem.","D":"People eat too much."}'::jsonb, '"B"', 'It comprehensively addresses both causes and solutions with specific, multi-dimensional analysis.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Which is the most rhetorically effective concession-then-counter move?', '{"A":"Some say it''s bad. I disagree.","B":"Granted, the policy entails significant short-term costs; nonetheless, the long-term societal benefits substantially outweigh these initial expenditures.","C":"It''s good.","D":"Costs are costs."}'::jsonb, '"B"', 'The ''granted... nonetheless'' construction shows the writer engaging seriously with opposing views before refuting them.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Pick the most analytically rich evidence for ''Climate change disproportionately affects developing countries.''', '{"A":"Poor countries suffer.","B":"Despite contributing under 10% of global emissions, low-income nations face the steepest agricultural losses and infrastructural damage from extreme weather events.","C":"Weather is bad.","D":"Climate is hot."}'::jsonb, '"B"', 'Quantitative contrast between contribution and harm sharpens the moral and analytical force.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Choose the strongest topic sentence for a paragraph on the limits of technological optimism.', '{"A":"Technology has problems.","B":"While technological progress has long been heralded as the engine of human flourishing, an uncritical embrace of innovation risks obscuring its uneven and sometimes regressive social consequences.","C":"Tech is bad.","D":"Innovation exists."}'::jsonb, '"B"', 'It establishes a sophisticated analytical frame that supports nuanced argumentation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Which best addresses ''Education should focus only on subjects with clear job prospects. Agree?''', '{"A":"Yes, agreed.","B":"Reducing education to mere job training undervalues its broader role in fostering civic engagement, ethical reasoning, and adaptability — qualities indispensable in a rapidly changing economy.","C":"I disagree.","D":"Jobs matter."}'::jsonb, '"B"', 'It refutes the premise with a multi-faceted, compelling counter-argument.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Pick the most precise hedging language for an academic claim.', '{"A":"This is definitely true.","B":"The evidence strongly suggests, though does not conclusively prove, a causal relationship.","C":"Maybe it''s true.","D":"It is so."}'::jsonb, '"B"', 'Calibrated hedging reflects appropriate epistemic caution in academic writing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Which response best addresses ''Some advocate banning private vehicles in city centres. Discuss both views and give your opinion.''', '{"A":"Cars should stay.","B":"Whilst advocates correctly identify health and emissions benefits, blanket bans risk excluding those with disabilities or essential commercial needs; targeted congestion-pricing schemes therefore offer a more equitable middle path, in my view.","C":"Cars cause pollution.","D":"Cities are crowded."}'::jsonb, '"B"', 'It presents both sides, identifies a flaw in one position, and proposes a substantiated personal stance.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Choose the best refutation of a strawman counter-argument.', '{"A":"Critics are stupid.","B":"This caricature of the policy as ''open borders'' misrepresents proposals that explicitly retain controlled, points-based admission criteria.","C":"They are wrong.","D":"Critics critique."}'::jsonb, '"B"', 'It identifies and corrects the misrepresentation with a precise reframing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Pick the strongest synthesising conclusion for an essay on AI ethics.', '{"A":"AI is hard.","B":"Navigating AI''s promise and peril demands neither uncritical adoption nor reflexive prohibition, but sustained democratic deliberation supported by transparent, accountable governance.","C":"AI exists.","D":"Be careful."}'::jsonb, '"B"', 'It synthesises the essay''s positions while pointing toward actionable principles — a Band 8+ conclusion.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Which best demonstrates academic register for ''People should travel more.''?', '{"A":"Travel is awesome.","B":"International travel cultivates intercultural competence and challenges parochial worldviews, benefits whose value extends well beyond individual enjoyment.","C":"Travel is fun.","D":"Going places is nice."}'::jsonb, '"B"', 'Lexical sophistication and analytical framing distinguish high-band writing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Choose the most fully developed response to ''Why is mental health awareness rising, and how can workplaces respond?''', '{"A":"It''s complicated.","B":"Reduced stigma, social-media advocacy, and pandemic-era stressors have collectively elevated mental health visibility; workplaces can respond through subsidised counselling, flexible scheduling, and mental-health-literate management training.","C":"People talk more.","D":"Work is stressful."}'::jsonb, '"B"', 'It comprehensively addresses both halves of the prompt with specific, multi-causal reasoning.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Pick the best topic sentence for a paragraph rebutting ''Tourism harms local cultures.''', '{"A":"Tourism is okay.","B":"While unrestrained tourism can erode cultural authenticity, well-managed cultural tourism can in fact incentivise the preservation of traditional crafts, languages, and ceremonies.","C":"Tourists are everywhere.","D":"Cultures change."}'::jsonb, '"B"', 'It concedes the partial truth of the opposing view while introducing a nuanced rebuttal.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Which is the most analytically rich claim about urbanisation?', '{"A":"Cities are big.","B":"Rapid urbanisation generates economic dynamism but simultaneously strains housing, sanitation, and social cohesion — a tension that defines contemporary policy debates worldwide.","C":"People move to cities.","D":"Urban life is busy."}'::jsonb, '"B"', 'It frames a tension and links it to broader policy implications, characteristic of advanced writing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Choose the best concluding paragraph opener for an essay arguing for tighter food labelling laws.', '{"A":"In conclusion, labels.","B":"Taken together, the public-health gains, consumer empowerment, and modest compliance costs make the case for stricter labelling not only persuasive but increasingly urgent.","C":"To wrap up.","D":"So labels matter."}'::jsonb, '"B"', 'It synthesises the supporting arguments and conveys urgency in formal register.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'TASK_RESPONSE', 'ADVANCED', 'MCQ', 'Which response demonstrates the most sophisticated handling of ''Some claim history is irrelevant in the modern world. To what extent do you agree?''', '{"A":"History is important.","B":"Far from being irrelevant, history equips citizens to recognise the recurring patterns — of populism, conflict, and reform — that continue to shape contemporary decision-making; dismissing it imperils both individual judgement and collective memory.","C":"I disagree completely.","D":"History happened."}'::jsonb, '"B"', 'It refutes the premise, supports the refutation with substantive reasoning, and articulates the stakes of the claim.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which word means ''happy''?', '{"A":"Sad","B":"Glad","C":"Angry","D":"Tired"}'::jsonb, '"B"', '''Glad'' is a synonym for ''happy''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the opposite of ''big''.', '{"A":"Huge","B":"Large","C":"Small","D":"Tall"}'::jsonb, '"C"', '''Small'' is the antonym of ''big''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which word fits: ''I ___ a sandwich for lunch.''', '{"A":"drank","B":"ate","C":"slept","D":"wrote"}'::jsonb, '"B"', 'You ''eat'' (past: ate) food like a sandwich.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'What is a synonym of ''fast''?', '{"A":"Quick","B":"Slow","C":"Heavy","D":"Late"}'::jsonb, '"A"', '''Quick'' means the same as ''fast''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which word describes the weather when it is very cold?', '{"A":"Hot","B":"Warm","C":"Freezing","D":"Mild"}'::jsonb, '"C"', '''Freezing'' describes very cold weather.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the correct word: ''My ___ is a doctor.''', '{"A":"sister","B":"car","C":"book","D":"chair"}'::jsonb, '"A"', 'Only a person (like a sister) can be a doctor.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which is the opposite of ''expensive''?', '{"A":"Costly","B":"Cheap","C":"Pricey","D":"Valuable"}'::jsonb, '"B"', '''Cheap'' is the antonym of ''expensive''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Pick the correct word: ''Please ___ the door.''', '{"A":"close","B":"sing","C":"jump","D":"sleep"}'::jsonb, '"A"', 'You ''close'' (or open) a door.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'What is a synonym of ''begin''?', '{"A":"End","B":"Stop","C":"Start","D":"Finish"}'::jsonb, '"C"', '''Start'' and ''begin'' have the same meaning.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which word means ''a person who teaches''?', '{"A":"Driver","B":"Teacher","C":"Doctor","D":"Cook"}'::jsonb, '"B"', 'A ''teacher'' is someone who teaches.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the best word: ''The bag is very ___; I cannot lift it.''', '{"A":"light","B":"heavy","C":"empty","D":"old"}'::jsonb, '"B"', 'Something difficult to lift is ''heavy''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which word means ''not difficult''?', '{"A":"Hard","B":"Tough","C":"Easy","D":"Complex"}'::jsonb, '"C"', '''Easy'' means ''not difficult''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Pick the synonym of ''big'' (informal).', '{"A":"Tiny","B":"Huge","C":"Small","D":"Short"}'::jsonb, '"B"', '''Huge'' means very big.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the correct word: ''I ___ my keys this morning.''', '{"A":"lost","B":"won","C":"painted","D":"cooked"}'::jsonb, '"A"', 'To ''lose'' (past: lost) means to misplace something.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'What is the opposite of ''happy''?', '{"A":"Joyful","B":"Sad","C":"Glad","D":"Pleased"}'::jsonb, '"B"', '''Sad'' is the antonym of ''happy''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which word means ''a place where you buy food''?', '{"A":"Library","B":"Hospital","C":"Supermarket","D":"School"}'::jsonb, '"C"', 'A ''supermarket'' is where food is sold.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Choose the correct word: ''The water is too ___ to drink.''', '{"A":"sweet","B":"hot","C":"green","D":"loud"}'::jsonb, '"B"', 'Water that cannot be drunk because of temperature is ''hot''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'What is a synonym of ''small''?', '{"A":"Tiny","B":"Tall","C":"Wide","D":"Long"}'::jsonb, '"A"', '''Tiny'' means very small.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Pick the word that does NOT belong: apple, orange, banana, chair.', '{"A":"apple","B":"orange","C":"banana","D":"chair"}'::jsonb, '"D"', 'A chair is furniture; the others are fruits.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'BEGINNER', 'MCQ', 'Which word completes the sentence: ''She ___ to music every evening.''', '{"A":"watches","B":"listens","C":"reads","D":"writes"}'::jsonb, '"B"', 'You ''listen to'' music.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which word best replaces ''very tired'' in formal writing?', '{"A":"Sleepy","B":"Exhausted","C":"Bored","D":"Lazy"}'::jsonb, '"B"', '''Exhausted'' is a stronger, more formal alternative to ''very tired''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the most appropriate word: ''The evidence ___ the theory.''', '{"A":"says","B":"supports","C":"makes","D":"does"}'::jsonb, '"B"', 'In academic writing, evidence ''supports'' (or refutes) a theory.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the synonym of ''important'' for essay writing.', '{"A":"Big","B":"Significant","C":"Nice","D":"Lots"}'::jsonb, '"B"', '''Significant'' is a more formal synonym suitable for essays.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which is the best collocation: ''___ a problem''?', '{"A":"do","B":"make","C":"solve","D":"have done"}'::jsonb, '"C"', '''Solve a problem'' is the standard collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the most precise word: ''The report shows a ___ increase in sales.''', '{"A":"big","B":"small","C":"substantial","D":"few"}'::jsonb, '"C"', '''Substantial'' precisely describes a large, significant increase.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which word fits best: ''The new policy will ___ many people.''', '{"A":"affect","B":"effect","C":"affecting","D":"affected"}'::jsonb, '"A"', '''Affect'' (verb) means to influence; ''effect'' is a noun.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the formal alternative to ''a lot of''.', '{"A":"Loads of","B":"Tons of","C":"Numerous","D":"Heaps of"}'::jsonb, '"C"', '''Numerous'' is the formal alternative.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the correct word: ''The committee ___ the proposal.''', '{"A":"agreed","B":"approved","C":"satisfied","D":"settled"}'::jsonb, '"B"', 'Committees ''approve'' proposals — a fixed collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which is the best synonym of ''bad'' (in academic writing)?', '{"A":"Awful","B":"Detrimental","C":"Crap","D":"Lousy"}'::jsonb, '"B"', '''Detrimental'' is the academic alternative.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the more precise word: ''The economy is ___.''', '{"A":"going up","B":"better","C":"flourishing","D":"good"}'::jsonb, '"C"', '''Flourishing'' precisely describes strong, healthy growth.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which word best fits: ''Government policies often ___ unintended consequences.''', '{"A":"do","B":"have","C":"produce","D":"happen"}'::jsonb, '"C"', '''Produce consequences'' is a standard collocation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the best word: ''The data ___ that the trend is reversing.''', '{"A":"thinks","B":"says","C":"indicates","D":"tells"}'::jsonb, '"C"', '''Indicates'' is the appropriate verb in academic writing for data.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the most academic option for ''in conclusion''.', '{"A":"To wrap up","B":"To sum up","C":"To conclude","D":"In a nutshell"}'::jsonb, '"C"', '''To conclude'' is the most formal of these options.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which word is correct: ''a ___ of people''?', '{"A":"amount","B":"number","C":"piece","D":"deal"}'::jsonb, '"B"', '''Number'' is used with countable nouns (''a number of people'').');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the best synonym of ''show'' for academic writing.', '{"A":"Tell","B":"Demonstrate","C":"Show off","D":"Point"}'::jsonb, '"B"', '''Demonstrate'' is the academic synonym for ''show''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the appropriate phrase: ''There is a ___ between income and education.''', '{"A":"link","B":"relation","C":"correlation","D":"all of the above"}'::jsonb, '"C"', 'In statistical/academic contexts ''correlation'' is most precise.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the right word: ''Climate change is a ___ issue.''', '{"A":"big","B":"hot","C":"pressing","D":"loud"}'::jsonb, '"C"', '''Pressing'' (urgent, demanding action) suits formal discussion of issues.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Which fits: ''The government should ___ stricter laws.''', '{"A":"do","B":"make","C":"implement","D":"use"}'::jsonb, '"C"', '''Implement'' is the formal verb used with laws and policies.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Pick the most precise synonym of ''use'' (resources).', '{"A":"Take","B":"Have","C":"Utilise","D":"Get"}'::jsonb, '"C"', '''Utilise'' is the formal alternative to ''use''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'INTERMEDIATE', 'MCQ', 'Choose the appropriate word: ''The findings ___ previous research.''', '{"A":"agree with","B":"corroborate","C":"go with","D":"are like"}'::jsonb, '"B"', '''Corroborate'' (to confirm) is the academic term.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the most nuanced replacement for ''because of'': ''The project failed ___ inadequate funding.''', '{"A":"due to","B":"by reason of","C":"on account of","D":"owing to"}'::jsonb, '"D"', '''Owing to'' is the most idiomatic and formal in academic writing for causation involving a noun phrase.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which word best conveys cautious agreement in academic writing?', '{"A":"Concur","B":"Endorse","C":"Acquiesce","D":"Affirm"}'::jsonb, '"C"', '''Acquiesce'' implies reluctant or passive agreement, conveying nuance.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the term that means ''a widely held but oversimplified idea''.', '{"A":"Prejudice","B":"Stereotype","C":"Conjecture","D":"Hypothesis"}'::jsonb, '"B"', 'A ''stereotype'' is a widely held but oversimplified generalisation.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the best synonym of ''persistent'' for an essay on social problems.', '{"A":"Ongoing","B":"Tenacious","C":"Entrenched","D":"Continual"}'::jsonb, '"C"', '''Entrenched'' implies a problem that is firmly established and difficult to change.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which word means ''the gradual destruction of something valuable''?', '{"A":"Erosion","B":"Detriment","C":"Decadence","D":"Adversity"}'::jsonb, '"A"', '''Erosion'' is used metaphorically for gradual undermining (e.g., ''erosion of public trust'').');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the most appropriate term: ''The author''s argument is ___ — it lacks supporting evidence.''', '{"A":"strong","B":"flimsy","C":"tenuous","D":"good"}'::jsonb, '"C"', '''Tenuous'' precisely describes a weak or insufficiently supported argument.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the best near-synonym of ''cause'' for cause-and-effect writing.', '{"A":"Engender","B":"Make","C":"Have","D":"Produce"}'::jsonb, '"A"', '''Engender'' (to give rise to) carries strong academic register.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which word best fits: ''The minister offered a ___ apology.''', '{"A":"deep","B":"big","C":"perfunctory","D":"good"}'::jsonb, '"C"', '''Perfunctory'' (done minimally and without enthusiasm) precisely conveys an inadequate apology.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the term that means ''inclined to find fault''.', '{"A":"Censorious","B":"Magnanimous","C":"Equanimous","D":"Indulgent"}'::jsonb, '"A"', '''Censorious'' means severely critical and fault-finding.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the most appropriate connector: ''The economy improved; ___, unemployment remained high.''', '{"A":"thus","B":"hence","C":"paradoxically","D":"therefore"}'::jsonb, '"C"', '''Paradoxically'' introduces a counterintuitive juxtaposition.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which best replaces ''shows'' in: ''The data ___ a clear trend.''', '{"A":"reveals","B":"sees","C":"realises","D":"witnesses"}'::jsonb, '"A"', '''Reveals'' is academically appropriate for data showing a pattern.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the word meaning ''to make something seem less important than it is''.', '{"A":"Aggrandise","B":"Underscore","C":"Downplay","D":"Highlight"}'::jsonb, '"C"', '''Downplay'' means to deliberately minimise importance.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the best academic alternative for ''big problem''.', '{"A":"Massive issue","B":"Significant challenge","C":"Huge thing","D":"Mega trouble"}'::jsonb, '"B"', '''Significant challenge'' is the appropriately formal phrasing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which term means ''an underlying assumption''?', '{"A":"Premise","B":"Conclusion","C":"Anecdote","D":"Disclaimer"}'::jsonb, '"A"', 'A ''premise'' is a foundational assumption upon which an argument rests.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the most precise word: ''His writing style is ___ and difficult to follow.''', '{"A":"clear","B":"simple","C":"convoluted","D":"plain"}'::jsonb, '"C"', '''Convoluted'' precisely describes overly complex, hard-to-follow writing.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the right collocation: ''to ___ a hypothesis''.', '{"A":"do","B":"posit","C":"have","D":"make happen"}'::jsonb, '"B"', '''Posit a hypothesis'' is the academic collocation meaning ''to put forward''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which best replaces ''getting worse''?', '{"A":"Going down","B":"Deteriorating","C":"Going bad","D":"Coming off"}'::jsonb, '"B"', '''Deteriorating'' is the formal academic verb.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Pick the most accurate term: ''A ___ argument relies on emotion rather than logic.''', '{"A":"sound","B":"specious","C":"empirical","D":"valid"}'::jsonb, '"B"', '''Specious'' describes an argument that seems plausible but is actually flawed.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Choose the best phrase: ''The findings have ___ implications for policy.''', '{"A":"big","B":"far-reaching","C":"hot","D":"open"}'::jsonb, '"B"', '''Far-reaching'' is the standard formal collocation with ''implications''.');

INSERT INTO public.drill_questions (skill, sub_skill, level, drill_type, prompt_text, options, correct_answer, explanation)
VALUES ('WRITING', 'VOCABULARY', 'ADVANCED', 'MCQ', 'Which word best fits: ''The committee remained ___ on the issue, refusing to commit.''', '{"A":"decisive","B":"forthright","C":"equivocal","D":"emphatic"}'::jsonb, '"C"', '''Equivocal'' means deliberately ambiguous or non-committal.');