This tool visualizes a list of projects on an interactive timeline, with filtering and search. Most of the code was written with AI assistance.

Setup: Simply fill in the information about your projects in the data.js file, then open index.html

Example: https://beststream.github.io/portfolio-visualizer

Example of a real portfolio: https://sunday.games/serge-kopov-portfolio

## URL filter parameters

Filters can be applied when opening the timeline by adding query parameters to the URL:

- `search=puzzle`
- `type=app`
- `status=released`
- `platform=ios`
- `position=unity-developer`
- `tag=highlight`

Parameters can be combined:

`?type=game&position=unity-developer&search=puzzle`

Use repeated parameters or comma-separated values to select multiple options:

`?status=released&status=unfinished&platform=ios,android`

Parameter values are case-insensitive. Spaces and punctuation in filter names are written as hyphens, so `Unity Developer` becomes `unity-developer`. `tags` is also supported as an alias for `tag`.
