## Description

<!-- What does this PR change and why? Include the user-facing rationale. -->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Documentation update
- [ ] Test / CI / tooling

## Testing

- [ ] Added or updated PHP tests (`composer test:unit`)
- [ ] Added or updated frontend tests (`pnpm test`) — if the change
      touches `packages/*/src/`
- [ ] Full PHP gate passes (`composer test` = analyse + lint:check + type coverage + Pest)
- [ ] TypeScript typecheck passes (`pnpm typecheck`)

## Checklist

- [ ] CHANGELOG.md updated under "Unreleased"
- [ ] Public API additions exported from `packages/*/src/index.ts`
      (if applicable)
- [ ] README / examples updated (if user-facing behaviour changed)
- [ ] No `@phpstan-ignore` or baseline additions without justification
