import test from 'node:test';
import assert from 'node:assert/strict';
import {formatRelativeTime, mergeTranscript} from '../src/chat-utils.js';

const NOW = new Date('2026-10-19T12:00:00Z').getTime();
const minutes = (n) => new Date(NOW - n * 60_000).toISOString();

test('relative time covers the ranges the history rail shows', () => {
  assert.equal(formatRelativeTime(minutes(0), NOW), '刚刚');
  assert.equal(formatRelativeTime(minutes(5), NOW), '5 分钟前');
  assert.equal(formatRelativeTime(minutes(90), NOW), '1 小时前');
  assert.equal(formatRelativeTime(minutes(60 * 30), NOW), '1 天前');
  assert.equal(formatRelativeTime(minutes(60 * 24 * 40), NOW), '1 个月前');
  assert.equal(formatRelativeTime(minutes(60 * 24 * 800), NOW), '2 年前');
});

test('relative time is empty for unusable input', () => {
  assert.equal(formatRelativeTime('not a date', NOW), '');
  assert.equal(formatRelativeTime(undefined, NOW), '');
  assert.equal(formatRelativeTime(minutes(-30), NOW), '刚刚');
});

test('transcripts append to Chinese text without inserting spaces', () => {
  assert.equal(mergeTranscript('最近的工作', '节奏怎么调整'), '最近的工作节奏怎么调整');
});

test('transcripts separate adjacent latin words but keep punctuation attached', () => {
  assert.equal(mergeTranscript('deep', 'seek'), 'deep seek');
  assert.equal(mergeTranscript('hello ', 'world'), 'hello world');
  assert.equal(mergeTranscript('工作', 'OK'), '工作OK');
});

test('empty transcript leaves the current input untouched', () => {
  assert.equal(mergeTranscript('已经写好的内容', ''), '已经写好的内容');
  assert.equal(mergeTranscript('已经写好的内容', '   '), '已经写好的内容');
  assert.equal(mergeTranscript('', '你好'), '你好');
});
