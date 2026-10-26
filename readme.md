## Website

🌐 Hosted on: https://shadowslavememories.neocities.org/

info: since I have only read up until chapter 2300, the memory list only includes memories up to this chapter. 

## Settings

Appearance and search preferences,
general settings, and your selected chapter are saved in your browser. They apply
to that browser and device; clearing site data removes them.

You can scroll the page while the pointer is outside the settings panel. Scrolling
inside the panel stays within settings, including at the top and bottom.

### Color

Choose **rank** or **tier** to color the memory cards, then pick a background color
for each category. Each group keeps its own palette.

**Reset rank to default** or **Reset tier to default** restores the selected palette
after confirmation. **Use colors from tier/rank** copies the other palette to the
selected group, matching the corresponding levels, and also asks for confirmation.

### Border

Choose **Rank** or **Tier** independently of the background color setting. Each
category has its own border style, color, and width from **0 to 20px**. Select
**None** to hide a border.

Each settings fieldset previews its selected border. When the style is None, the
fieldset and its controls appear slightly translucent and remain editable.

By default, borders are based on **rank**. All categories in both groups use None,
except **?**, which uses a **dashed, 2px, #7f8c8d** border.

**Reset rank/tier to default** restores the selected group after confirmation.
**Use borders from tier/rank** copies the other group’s border settings to the
corresponding levels in the selected group.

### Glint

Enable the animated shine for individual ranks or tiers. A memory glints when
either its rank or its tier is selected. **Divine** and **VII** are enabled by default.

### General

- **Show memory history:** display the history indicators in memory details.
  Hover over or click an indicator to inspect changes up to the selected chapter.
  This is enabled by default.
- **Show given away memories under Destroyed:** combine those memories into the
  Destroyed section. This changes their display grouping and preserves their history.
  Disable it to restore the separate Given Away section. It is off by default.

### Search

Choose a matching mode and optional modifiers. The default is **Contains**, with
all modifiers off.

| Matching mode | Behavior |
| --- | --- |
| Contains | Match text anywhere in a selected field. |
| Equals | Match the entire field. |
| Starts with | Match the beginning of a field. |
| Ends with | Match the end of a field. |
| Does not contain | Exclude memories with a match in any selected field. |
| Regular expression (regex) | Search using a regular expression. |

- **Case sensitive:** distinguish uppercase and lowercase letters.
- **Wildcard:** use `*` for any text, including no characters, and `?` for one
  character. The matching mode still controls the boundaries. For example,
  `*Shard` with Equals matches a whole field ending in “Shard”.
- **Fuzzy:** allow one character insertion, deletion, replacement, or adjacent
  letter swap. This can be combined with Wildcard and Case sensitive. With both
  Fuzzy and Case sensitive enabled, a case difference counts as a character edit.

Wildcard and Fuzzy are disabled in regex mode, with their choices remembered when
you return to a text mode. Invalid or overly slow regex patterns display an error.

## Running locally

Serve this directory with a static HTTP server, for example:

```sh
python -m http.server 8765 --bind 127.0.0.1
```