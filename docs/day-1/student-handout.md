# Day 1 handout: the first TrainLead screen

## Step 1: a reusable requirement card

A requirement is data first: its type says which facts are known and which remain unknown. The card receives one requirement through a typed input and renders it without owning the source data. The shell repeats cards with `@for` and a stable ID. A signal controls which tab is visible.

Mini example:

```ts
readonly name = input.required<string>();
```

Product example: `RequirementCard` accepts a `Requirement`; `App` owns `demoRequirements` and passes each item to the card.

### Exercise (10 minutes)

Create a standalone `TrainerCard` with a required `trainer` input and render the trainer's name, city, and first skill. Starter and reference solution: [exercise files](../exercises/day-1-step-1/).

### Quiz

1. Why does the card use a required input?
2. Why should an `@for` loop track a stable ID?
3. In this example, which component owns the list data?

Answers: 1) Angular can check the parent supplies the value. 2) Stable identity lets Angular update the right view efficiently. 3) The shell (`App`).

### Common mistakes

- Forgetting to import a standalone child component in the parent.
- Tracking a list by its changing display text instead of a stable ID.
- Treating missing travel, food, or stay details as `Provided` instead of `Unknown`.

AngularJS comparison: AngularJS used `ng-repeat`; modern Angular uses `@for`. AngularJS `$scope` is not part of this app.