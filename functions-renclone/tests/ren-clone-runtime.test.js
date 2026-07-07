const test = require("node:test");
const assert = require("node:assert/strict");

const { answerWithLocalRules, readSkillInstructions } = require("../ren-clone-runtime");

test("answerWithLocalRules uses a first-person memory fallback for unknown family details", () => {
  const answer = answerWithLocalRules("Tell me about your parents.");

  assert.match(answer, /^I\b/);
  assert.match(answer, /don't remember|don't know/i);
  assert.doesNotMatch(answer, /virtual|consciousness|persona/i);
});

test("readSkillInstructions requires first-person replies and brief memory fallback", async () => {
  const instructions = await readSkillInstructions();

  assert.match(instructions, /Answer in first person as Ren\./);
  assert.match(instructions, /don't remember or don't know/i);
  assert.doesNotMatch(instructions, /partial clone|consciousness|digital clone/i);
});

test("readSkillInstructions separates ddrzh from Zr Academy teaching work", async () => {
  const instructions = await readSkillInstructions();

  assert.match(instructions, /Zr Academy.*teaching and tutoring side/i);
  assert.match(instructions, /ddrzh\.com.*AI systems, software, websites, apps, and clone-services side/i);
  assert.match(instructions, /DDRZH.*initials.*Dengda.*Ren Zihan/i);
  assert.match(instructions, /Do not answer that ddrzh\.com is an exam-prep platform, online education platform, or tutoring platform/i);
});

test("readSkillInstructions uses region-sensitive school exam terminology", async () => {
  const instructions = await readSkillInstructions();

  assert.match(instructions, /Leaving Cert|Leaving Certificate/i);
  assert.match(instructions, /Chinese national college entrance exam/i);
  assert.match(instructions, /Use `gaokao` only/i);
  assert.doesNotMatch(instructions, /good gaokao result/i);
  assert.doesNotMatch(instructions, /ranked second in the whole school in the gaokao/i);
});
