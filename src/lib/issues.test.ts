import assert from 'node:assert/strict';
import test from 'node:test';

import { ISSUES } from './issues';

/**
 * The expanded row leads with `plain` and the picture, and hides everything
 * else. So every issue must carry both, and `plain` must read like a sentence
 * for a person, not a rule report.
 */
test('every issue has a plain sentence and a picture', () => {
  for (const issue of ISSUES) {
    assert.ok(issue.plain.length >= 40, `${issue.id}: plain sentence too short`);
    assert.ok(/[.!]$/.test(issue.plain.trim()), `${issue.id}: plain should end as a sentence`);
    assert.ok(!/<[a-z]/i.test(issue.plain), `${issue.id}: no markup in the plain sentence`);
    assert.ok(!/\b(aria|axe|landmark|DOM|attribute|tabindex|role=)\b/i.test(issue.plain), `${issue.id}: jargon in the plain sentence`);
    assert.ok(issue.picture && typeof issue.picture.kind === 'string', `${issue.id}: picture missing`);
    if ('now' in issue.picture) {
      assert.ok(issue.picture.now.hears && issue.picture.fixed.hears, `${issue.id}: both sides must say what the agent hears`);
    }
  }
});

test('issue ids are unique', () => {
  const ids = ISSUES.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});
