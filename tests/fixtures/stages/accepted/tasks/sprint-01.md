# Sprint 01

## Goal

- Deliver one independently runnable slice: 示例切片

## Tasks

- [ ] Implement the smallest runnable behavior.

## Verification Report

- Machine report: .harness/verification-report.json#fixture-full-report
- Commands: node --check src/index.js; node --test tests/; node tests/contract/check-contracts.mjs
- Results: passed
- Executed at: 2026-07-31T05:00:00Z
- User-path evidence: none registered
- Uncovered risks: 示例风险
- Cleanup performed: node scripts/cleanup-test-data.mjs=passed
- Rollback steps: git revert <commit>
- 提交哈希: 0123abc
