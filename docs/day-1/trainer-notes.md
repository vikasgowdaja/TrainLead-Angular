# Day 1 trainer notes

## Timing (6 hours)

| Time | Segment |
| --- | --- |
| 00:00-00:30 | Node, npm, Git, editor setup, and AngularJS end-of-life context. |
| 00:30-01:10 | Workspace layout and TypeScript types through the Requirement model. |
| 01:10-02:00 | Standalone components, interpolation, and property binding in isolation. |
| 02:00-02:10 | Break. |
| 02:10-03:00 | Build the reusable RequirementCard and the Travel/Food/Stay strip. |
| 03:00-03:45 | Event binding and signals for the Requirements/Inbox tabs and theme. |
| 03:45-04:00 | Break. |
| 04:00-04:50 | `@if` and `@for`, tracking by stable IDs, and review of the mock sample. |
| 04:50-05:30 | Student Trainer card exercise and pair review. |
| 05:30-06:00 | Demo, common mistakes, and recap. |

## Live-coding script

1. Start with a plain TypeScript requirement object and render its title in a tiny Angular component.
2. Move the card into its own standalone component and pass the object through a required input.
3. Add the support strip and source count, then render the list using `@for` with a stable ID.
4. Add a signal for the selected tab and bind a button click to it.
5. Run the tests and end on the grouped Mysuru sample.

Likely questions: signals update templates synchronously; `@for` track keys help Angular identify repeated items; standalone components import the template dependencies they use.

Fallback: use tag `day1-step1` and the checked-in mock data if live edits break. AngularJS 1.x used controllers and `$scope`; modern Angular uses components and signals. AngularJS is end-of-life and is not the product implementation path.

## Recap slide outline

- A typed model makes the requirement shape visible.
- A standalone component packages one reusable view.
- Inputs pass data down; event bindings send user actions up.
- Signals and Angular's `@if`/`@for` drive this first screen.
- The sample is one opportunity with three source postings.