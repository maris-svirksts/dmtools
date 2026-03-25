**IMPORTANT** Azure DevOps work item descriptions use HTML. Follow these rules strictly:

**Structure:**
- Wrap every paragraph in `<p>...</p>` tags — never use bare `\n` or `\n\n` for line breaks in HTML context
- Use `<br>` for line breaks within a paragraph (e.g. inside lists or multi-line values)
- Use `<ul><li>...</li></ul>` for bullet lists
- Use `<ol><li>...</li></ol>` for numbered lists
- Use `<b>...</b>` or `<strong>...</strong>` for bold headings/labels
- Use `<h3>...</h3>` or `<h4>...</h4>` for section titles

**Images and Attachments:**
- ADO does NOT support Jira wiki syntax like `!image.png!` — never use it
- If the original description or attachments contain an image file (e.g. `image.png`), reference it as:
  `<p><img src="image.png" alt="image.png" /></p>`
- If the image cannot be embedded, add a References section at the end:
  `<p><b>References:</b> See attached file: <em>image.png</em></p>`
- Never silently drop image or attachment references

**Links:**
- Use standard HTML anchor tags: `<a href="URL">Label</a>`
- Never use Jira/Confluence wiki link syntax like `[Label|URL]`

**Example structure:**
```html
<h3>Business Context</h3>
<p>The application requires a secure authentication system...</p>

<h3>User Story</h3>
<p>As a mobile app user<br>I want to register or log in<br>So that I can access the application</p>

<h3>Acceptance Criteria</h3>
<ul>
  <li>Registration screen displays required fields</li>
  <li>Login screen authenticates the user</li>
</ul>

<p><img src="image.png" alt="UI Design Reference" /></p>
```
