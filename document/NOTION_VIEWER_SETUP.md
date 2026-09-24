# Notion Document Hub viewer setup

The Documentation module reads the current pages in the owner's private Document Hub. It has a separate connection from Codex's Notion MCP session. The website does not edit Notion pages or their project relationships.

1. Create an internal Notion integration with read-content capability. Share the Document Hub database with it. Keep the database private. Project names and project filters are not displayed in the viewer; manage those relationships in Notion.
2. Set `NOTION_API_TOKEN` and `NOTION_DOCUMENTS_DATA_SOURCE_ID` in the trusted application environment. The selected data source ID is `3e4bb9f9-e5f9-8086-81f8-000be9e74ae7`. Keep the token outside `NEXT_PUBLIC_*` variables and source control.
3. Apply the forward migration `20260923034630_notion_documentation_module.sql` through the normal Supabase migration workflow. It enables Documentation for the owner role. Grant other roles or individual users access in Idea Dump's Access Control screen as needed.
4. Deploy the branch containing the viewer to the intended environment. Pushing a feature branch does not update a production deployment that tracks `main`; merge and deploy it through the normal release workflow.
5. Open `/documentation` as an authorized user. Check the Hybrid Postpaid Technical Documentation page, including its tables, appendices, diagrams, Versions link, and Refresh action. Run library search with a phrase from the document body, then find that phrase in the open document.

Module Visibility reads the full validated `dim_modules` catalog, including disabled entries. Navigation and access use its enabled entries plus role grants and user overrides. Adding a module row does not require registering its slug in a frontend or server allowlist. The module's actual pages, API handlers, and route authorization still need to be implemented and deployed; a database entry cannot create those routes.

If the token or data source is missing, the API returns an unavailable state. If the Notion integration has not been shared with Document Hub, it cannot list or read those pages.

The site uses Notion API version `2026-03-11`. API responses and assets are private and never cached. Library search reads each matching current document on submission, so larger collections take longer; the browser shows progress and can cancel the scan. An open reader keeps its last successful body in memory only until navigation or sign-out, and labels it stale after a transient refresh failure.
