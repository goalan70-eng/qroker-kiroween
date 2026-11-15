import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_MODELS, MAX_DIFF_CHARS, containsPotentialSecret, mayCallToday,
  outputText, parseArgs, validateDiff
} from './openai-review.mjs';

test('preview is default; manual --send is required for actual API calls', () => {
  assert.deepEqual(parseArgs([]), {send:false,hook:false,base:'auto',model:'gpt-6-luna'});
  assert.deepEqual(parseArgs(['--send','--base','HEAD~1','--model','gpt-6.1-terra']),
    {send:true,hook:false,base:'HEAD~1',model:'gpt-6.1-terra'});
  assert.ok(ALLOWED_MODELS.includes('gpt-6-luna'));
  assert.throws(() => parseArgs(['--model','gpt-6-astra']));
  assert.throws(() => parseArgs(['--base','--bad']));
});

test('diff allows only bounded, secret-screened text', () => {
  assert.equal(validateDiff(''), 'empty');
  assert.equal(validateDiff('diff --git a/src/game/a.ts b/src/game/a.ts\n+const a=1;'), 'ready');
  assert.throws(() => validateDiff('a'.repeat(MAX_DIFF_CHARS + 1)));
  assert.equal(containsPotentialSecret('OPENAI_API_KEY="abcde12345678912345"'), true);
  assert.equal(containsPotentialSecret('-----BEGIN PRIVATE KEY-----'), true);
  assert.equal(containsPotentialSecret('const tokenCount = 3;'), false);
  assert.throws(() => validateDiff('diff --git x\n+OPENAI_API_KEY="abcde12345678912345"'));
});

test('response extraction handles multiple message items', () => {
  const data = { output: [
    {type:'reasoning',summary:[]},
    {type:'message',content:[{type:'output_text',text:'Finding 1'}]},
    {type:'message',content:[{type:'output_text',text:'Finding 2'}]}
  ] };
  assert.equal(outputText(data), 'Finding 1\nFinding 2');
  assert.equal(outputText({output:[]}), '');
  assert.equal(outputText({output:[{type:'reasoning'}]}), '');
});

test('local API call limit is three attempts per UTC day', () => {
  assert.equal(mayCallToday({}, '2026-11-15'), true);
  assert.equal(mayCallToday({day:'2026-11-15',calls:2}, '2026-11-15'), true);
  assert.equal(mayCallToday({day:'2026-11-15',calls:3}, '2026-11-15'), false);
  assert.equal(mayCallToday({day:'2026-11-14',calls:99}, '2026-11-15'), true);
});
