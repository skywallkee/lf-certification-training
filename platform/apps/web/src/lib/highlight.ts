import bash from "highlight.js/lib/languages/bash";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import shell from "highlight.js/lib/languages/shell";
import yaml from "highlight.js/lib/languages/yaml";
import rehypeHighlight, { type Options } from "rehype-highlight";

/**
 * Syntax highlighting for code blocks in lessons, question stems, explanations and lab tasks. Runs on the
 * server only (lessons and Markdown render in server components), so no highlighter ships to the browser.
 *
 * Only languages the curriculum needs are registered, and a fence needs a language to be coloured
 * (```yaml, ```bash): untagged and ```text blocks stay plain, since guessing would colour prose.
 * Token colours are in globals.css (.hljs-*), tuned for the always-dark code block.
 */
export const highlightOptions: Options = {
  detect: false,
  languages: { bash, dockerfile, go, ini, json, python, shell, yaml },
  aliases: {
    bash: ["sh", "zsh", "kubectl"],
    shell: ["console", "shell-session"],
    ini: ["toml", "conf"],
    yaml: ["yml", "helm"],
  },
  plainText: ["text", "txt", "plain", "output"],
};

export const rehypeHighlightPlugin: [typeof rehypeHighlight, Options] = [rehypeHighlight, highlightOptions];
