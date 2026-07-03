# Argus — Absolute Completion Specification (`spec.md`)

This document establishes the strict, non-negotiable quality and completeness criteria for all generated AI news briefs. The Evaluator (Judge) Agent MUST grade all drafts against these rules.

## 1. Length & Density
* **Strict Word Limit**: Each individual feed summary MUST be **under 150 words**.
* **High Information Density**: Every sentence must convey substantive technical or product information. Strip all conversational filler and introductory fluff.

## 2. Content Relevance
* **Core Focus Areas**: Prioritize and include articles covering:
  1. **Model & Product Releases**: Core foundation models, platform capabilities, open-source releases, and infrastructure scaling.
  2. **Strategic Trends & Opinion Pieces**: Expert perspectives on industry adoption, market economics, future capabilities, and VC forecasts.
  3. **Engineering & Design Patterns**: Software architecture, agentic workflows, prompting loops, evaluation frameworks, and code review methodologies.
* **Exclude Pure Fluff**: Ignore generic promotional marketing events or minor bug fix patch notes that lack substantive technical, strategic, or architectural insights.

## 3. Factuality & Zero-Hallucination
* **100% Source Traceability**: Every single claim, benchmark number, model name, and date MUST be directly present in the raw scraped text provided to the agent.
* **No Speculation**: Do not infer future timelines, unreleased features, or competitor comparisons unless explicitly stated in the source text.

## 4. Tone & Formatting
* **No Meta-Commentary**: Never use introductory phrases such as *"This article discusses..."*, *"Here is a summary of..."*, or *"The feed mentions..."*. Start immediately with the product or announcement name.
* **Empty Feed Exception**: When there are no substantial launches, outputting `* **No major announcements** in this scanning period.` is strictly required and does NOT violate the meta-commentary rule.
* **Structured Bullets**: Use concise Markdown bullet points with bold headers for each update.
