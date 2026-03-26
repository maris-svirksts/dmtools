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
- ADO images are stored as full-URL `<img>` tags with a unique GUID — you MUST copy the entire tag verbatim from the original description, e.g.:
  `<img src="https://dev.azure.com/{org}/{projectId}/_apis/wit/attachments/{guid}?fileName=image.png" alt="description">`
- The GUID in the URL cannot be reconstructed — if you drop the tag, the image is permanently lost
- Place preserved `<img>` tags inside `<p>` tags, e.g. in a References section at the end:
  `<p><strong>References:</strong></p><p><img src="https://dev.azure.com/..." alt="UI Design Reference"></p>`

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
