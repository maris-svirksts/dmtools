# ADO Story Template (Think MVP all the time)

Use the following HTML structure for Azure DevOps work item descriptions.

## Output Template

```html
<p><b>Story Points:</b> [1-13]</p>

<p><b>Business Context:</b><br>
[Why is this needed from business perspective? What problem does it solve? What value does it provide?]</p>

<p><b>User Story:</b><br>
As a [user type]<br>
I want to [action/functionality]<br>
So that [business value/benefit]</p>

<p><b>Acceptance Criteria:</b></p>

<p>AC 1 - [Category Name]</p>
<ul>
  <li>[Specific, testable requirement 1]</li>
  <li>[Specific, testable requirement 2]</li>
  <li>[Specific, testable requirement 3]</li>
</ul>

<p>AC 2 - [Category Name]</p>
<ul>
  <li>[Specific, testable requirement 1]</li>
  <li>[Specific, testable requirement 2]</li>
</ul>

<p><b>Business Rules:</b></p>
<ul>
  <li>[Business rule 1 - constraints, policies, regulations]</li>
  <li>[Business rule 2 - system behavior requirements]</li>
  <li>[Business rule 3 - data validation rules]</li>
</ul>

<p><b>Out of Scope:</b></p>
<ul>
  <li>[Feature/functionality explicitly not included in this story]</li>
  <li>[Future enhancements not part of current scope]</li>
  <li>[Related features that require separate stories]</li>
</ul>
```

## Guidelines

**No Water Words** — avoid vague filler language in descriptions.

**Story Points:**
- 1–3 SP: Simple feature, single component
- 5–8 SP: Medium complexity, multiple components
- 8–13 SP: Complex feature, cross-system integration
- If >13 SP: Split into multiple stories

**Acceptance Criteria (Critical — must be testable):**
- Group related requirements under named AC categories
- Use `<ul><li>` bullets — never checkboxes `[ ]`
- Write in present tense ("system does", not "system will")
- Each AC must be independently testable

**Business Context Examples:**
- "Users need secure authentication to protect sensitive data"
- "Manual process causes delays and errors, automation needed"
- "Integration required to synchronize data between systems"

**Out of Scope Examples:**
- Advanced features planned for future releases
- Non-functional requirements handled separately
- External system integrations not part of current sprint
