Overall principles:
1. when in the grading mode, it allows to move back and forth among both graded and ungraded cards that were identified as relevant when the grading mode started.
2. The grading queue should follow sort order as in the grid view - by grade first, then by color within a given grade swimlane
3. Grading results should not modify the grading queue
4. Grading queue should only be reloaded when the grading mode is entered

Detailed scenarios:
1. Grading directly from start, given there are ungraded cards

Given there are some ungraded cards in a set

When the app is started
Then the grading mode is started by default
And the grading list contains all ungraded cards

When a card is graded
Then the view automatically moves to the next one
When a back button is clicked
Then the previous graded card is shown

When user toggles to grid view
Then no filter is applied

2. Grading directly from start, given there are no ungraded cards

Given there are no ungraded cards in a set

When the app is startd
Then it's automatically in a grid view

When user goes to the grade mode using the toggle
Then all cards in a set are loaded to grading queue

3. Grading from a selected card, no filter

Given current view is in grid mode without any filters applied
When user clicks on a selected card
Then the grading mode loads all cards in a selected set
And the clicked card is displayed
And next/back navigation allows to cycle through the whole set

When user switches back to the grid view, either with a toggle or clicking the card
Then the scroll position is retained

4. Grading from a selected card, filter applied

Given current view is in grid mode with a filter applied
When user clicks on a selected card
Then the grading mode loads all cards in a selected set matching the applied filter criteria

Given current view is in grid mode with a filter on a particular grade applied
When user clicks on a selected card
Then the grading mode loads all cards in a selected set matching the applied filter criteria
When user changes a grade of a given card
Then the view automatically moves to the next one
When user goes back then the previously graded card is shown (even though it does not match the filter criteria when the grading mode was entered)
