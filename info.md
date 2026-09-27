# Tender Automation PoC Architecture Context

## 1. Purpose and scope

This document describes the planned and currently implemented architecture of the Tender Automation proof of concept.

The purpose of the PoC architecture is to provide a controlled environment in which the existing Tender Automation solution can be demonstrated end to end. The PoC is intended to support document ingestion, tender assessment, response planning, draft generation, review, Chat, and Word export.

This document describes the system and its relationships. It does not define a production target architecture, a migration plan, or diagramming instructions.

## 2. Architecture boundary

The PoC spans three main platform areas:

1. An Azure Databricks staging workspace used to host the frontend as a Databricks App.
2. An Azure subscription containing the backend and supporting Azure services.
3. The Ayvens staging API Management platform used as the controlled entry point to the backend API.

The main runtime path is:

```text
Authorized user
→ Azure Databricks App frontend
→ Ayvens staging API Management
→ Azure Web App backend
→ Data, storage, search, AI, and document-processing services
```

## 3. Users and access boundary

### 3.1 Intended users

The intended users are members of the Data Science team and selected PoC participants who have been granted access to the staging Azure Databricks environment and to the Databricks App resource.

### 3.2 Frontend access control

The frontend is hosted as an Azure Databricks App in the Data Science staging workspace.

Azure Databricks provides the external access boundary for the frontend:

- The frontend is not intended to be anonymously accessible.
- A user must authenticate through the organization identity provider when opening the Databricks App URL.
- A user must be recognized by the staging Databricks account or workspace access model.
- A user must have permission to use the Databricks App resource.
- Users without access receive an authorization failure and cannot open the application.

For the PoC, this Databricks access control is the primary control over who can open the frontend.

### 3.3 Application authentication inside the frontend

The recycled application contains Microsoft Entra ID and MSAL authentication support. For the PoC, the intention is to avoid the second application-level Entra login where possible.

The planned PoC mode is an explicit demo mode:

```text
VITE_AUTH_MODE=demo
```

In this mode:

- The frontend does not initialize MSAL.
- The frontend does not redirect the user to a second Microsoft login.
- The frontend does not request an Entra access token for the backend.
- The existing Entra implementation remains in the codebase for other environments or later reactivation.

This is a PoC-specific simplification. Databricks access control is not presented as a general replacement for application-level identity and authorization in a production architecture.

## 4. Azure Databricks staging environment

### 4.1 Azure Databricks workspace

The frontend is deployed in the Data Science staging Azure Databricks workspace.

The Databricks environment provides:

- The Databricks App resource.
- The generated Databricks App URL.
- Authentication before access to the App URL.
- App-level permissions controlling who can use or manage the app.
- Serverless application compute.
- Application deployment from source held in the workspace or linked to source control.
- Runtime and deployment logs.
- Databricks secret resources when required by the app deployment.

### 4.2 Databricks App frontend

The frontend technology is:

```text
React
TypeScript
Vite
```

The Databricks App currently hosts the frontend build and runtime server.

The frontend is responsible for:

- Displaying available tenders.
- Starting synchronization and generation workflows.
- Displaying Evaluation Reports.
- Displaying and editing Response Structures.
- Displaying and editing Bronze Drafts.
- Supporting Chat interactions.
- Displaying generation and synchronization progress.
- Requesting Word export.
- Calling the backend through the APIM endpoint.

The frontend uses the Databricks App port supplied at runtime and listens on all interfaces inside the Databricks application environment.

### 4.3 Frontend build dependencies

Frontend npm dependencies are resolved through the corporate JFrog Artifactory npm registry.

The frontend repository contains a non-sensitive `.npmrc` with:

- The JFrog npm registry URL.
- A reference to an environment variable containing the access token.

The Databricks App receives the JFrog token through a Databricks secret resource. The underlying secret is stored in the existing `mainscope` secret scope, which is backed by Azure Key Vault.

Relevant secrets include:

```text
JFROG-ARTIFACTS-USER
JFROG-ARTIFACTS-TOKEN
```

The JFrog credentials are needed during dependency installation and frontend build. They are not application-user credentials.

## 5. Frontend-to-backend communication

### 5.1 Backend API base URL

The frontend calls the backend through the Ayvens staging API Management gateway.

The frontend build is configured with an API base URL similar in structure to:

```text
https://api.staging.aldautomotive.com/stg/hq-datascience-ai/hq-datascience-tender-tool-trials
```

The exact path exposed for each Tender Automation endpoint is determined by the APIM API configuration.

An example of the API naming and routing pattern is:

```text
https://api.staging.aldautomotive.com/stg/hq-datascience-ai/hq-datascience-tender-tool-trials/realtime/calls/{call_id}/accept?api-version=<version>
```

The example demonstrates the expected structure of the staging gateway hostname, organizational path, PoC API path, operation path, route parameter, and optional API version.

### 5.2 APIM subscription key

The PoC backend API is protected by an Azure API Management subscription key.

The frontend sends:

```http
Ocp-Apim-Subscription-Key: <PoC subscription key>
```

The header is added centrally by the frontend HTTP client so that normal JSON requests, multipart requests, downloads, Chat requests, and progress requests use the same APIM access mechanism.

The subscription key is accepted as low sensitivity for this PoC. Because the key is used by browser code, it is visible in browser developer tools and must not be treated as a protected production secret.

The PoC subscription should therefore be:

- Dedicated to this PoC API.
- Limited to the required APIM product or API scope.
- Separated from production subscriptions.
- Revocable and rotatable.
- Removed or rotated after the PoC.

### 5.3 API Management developer portal

APIM subscriptions and developer access are managed through the Ayvens staging API Management developer portal:

```text
https://portal.api.staging.aldautomotive.com/
```

The portal is used for activities such as:

- Discovering the available staging APIs and products.
- Requesting or managing subscriptions.
- Obtaining the primary or secondary subscription key.
- Reviewing operation definitions and API versions.
- Testing or understanding the exposed API contract where permitted.

### 5.4 Cross-origin communication

The frontend and backend use different public hostnames:

```text
Frontend:
Azure Databricks App URL

Backend gateway:
https://api.staging.aldautomotive.com/
```

Consequently, browser communication requires compatible CORS configuration in APIM and the backend.

The allowed origin must include the exact Databricks App origin.

Expected request headers include:

```text
Content-Type
Ocp-Apim-Subscription-Key
Authorization, where Entra mode is used in another environment
```

Expected response headers used by the application can include:

```text
X-Chat-ID
X-Ready-For-Report
```

Streaming and Server-Sent Events must pass through APIM without being buffered in a way that prevents incremental updates.

## 6. Ayvens staging API Management layer

Azure API Management is the controlled public entry point for the backend.

Its responsibilities in the PoC include:

- Exposing the Tender Automation API under the Ayvens staging API domain.
- Applying the organizational API path and operation routing.
- Requiring a valid PoC subscription key.
- Rejecting requests without the expected subscription credentials.
- Applying CORS policies required by the Databricks-hosted frontend.
- Forwarding accepted requests to the Azure Web App backend.
- Preserving the required request bodies, query parameters, upload content, download content, and streaming responses.
- Providing a central place for API subscription management and operational policies.

APIM subscription-key validation is a consumer-access control. In this PoC design, it is not individual end-user authentication.

## 7. Azure subscription

The Azure subscription contains or will contain the backend application and the principal managed services required by Tender Automation.

The exact subscription name, resource group names, service SKUs, and resource names should be taken from the deployment configuration when finalized. They are not assumed in this document.

The planned subscription contents include:

- One or more Azure resource groups for the PoC.
- Azure App Service or Web App for the FastAPI backend.
- An App Service Plan or equivalent compute hosting the backend.
- Azure Database for PostgreSQL or the selected managed PostgreSQL service.
- Redis or the selected Redis-compatible managed service.
- Azure Storage Account with Blob Storage containers.
- Azure AI Search.
- Azure OpenAI resources where direct Azure OpenAI paths are used.
- Azure AI Document Intelligence where document extraction requires it.
- Azure Key Vault for backend secrets, if integrated into the final deployment.
- Application monitoring resources where enabled.
- Networking, DNS, private endpoints, firewall rules, or allowlists required by the selected services.

## 8. Backend Azure Web App

### 8.1 Hosting

The backend is planned to run as a Python FastAPI application in an Azure Web App or App Service.

The backend is not intended to be called directly by the frontend. The expected request path is:

```text
Databricks App frontend
→ Ayvens staging APIM
→ Azure Web App backend
```

Direct exposure of the Web App should be minimized or restricted according to the PoC platform constraints.

### 8.2 Backend responsibilities

The FastAPI backend is responsible for:

- Tender management.
- Document synchronization and ingestion.
- Document conversion and text extraction.
- Persistence of tender data and generated artifacts.
- Azure AI Search indexing and retrieval.
- Evaluation Report generation.
- Response Structure generation.
- Bronze Draft generation.
- Chat handling.
- Progress reporting.
- Generation locks.
- Company Information management.
- Administration endpoints.
- Word document generation and download.

### 8.3 PoC authentication mode

The application contains Entra and local authentication logic. The planned PoC backend mode is:

```text
AUTH_MODE=demo
ENVIRONMENT=poc
```

In demo mode:

- The backend does not require an Entra bearer token from the frontend.
- The backend does not perform Entra JWT validation.
- The backend resolves or creates one fixed technical or demo user.
- The demo user provides the `User` object required by the existing dependency and administration logic.
- The existing `entra` behavior remains available in the codebase.
- Demo mode must be rejected outside an explicitly allowed PoC environment.

Example configuration concepts are:

```text
DEMO_USER_EMAIL=tender-demo@poc.local
DEMO_USER_ROLE=admin
```

The role can be reduced to `user` if administration functions are not needed during the demo.

### 8.4 Identity consequences

The current functional entities do not use user ownership fields for tenders, reports, structures, Bronze versions, or Chat messages.

Using one shared demo user therefore does not break an existing user-ownership model, because no such ownership model is currently implemented.

The PoC consequences are:

- All admitted users have the same backend application identity.
- Users can access the same tender data.
- The system does not provide individual business-data auditability.
- The system does not provide tender-level user isolation.
- Administration access is shared if the demo user is an administrator.

This is accepted only for the PoC.

## 9. PostgreSQL

The PoC uses a PostgreSQL database, expected to be hosted using the selected managed PostgreSQL service in the Azure subscription.

PostgreSQL stores the principal transactional and workflow state, including:

- Tenders.
- Tender files and extracted file content.
- Evaluation Report metadata.
- Response Structures.
- Bronze versions.
- Chat messages and Chat sessions.
- Users and user roles.
- Company and workflow metadata where implemented.
- Version numbers and timestamps.

The backend connects to PostgreSQL using server-side credentials or a connection string. PostgreSQL credentials must not be included in the frontend.

The exact managed service, server name, database name, compute tier, availability mode, and network configuration remain deployment details to be finalized.

## 10. Redis or Redis-compatible service

The PoC uses Redis or an approved Redis-compatible service.

Redis is used for transient operational state, including:

- Progress state for long-running synchronization and generation operations.
- Generation locks.
- Synchronization locks.
- Coordination signals used by the backend.

Redis does not store the primary tender records or final generated artifacts.

The selected Azure service may be Azure Managed Redis, Azure Cache for Redis where still applicable in the environment, or another approved Redis-compatible deployment. The exact service and SKU should be confirmed from the deployment configuration.

The backend accesses Redis using server-side connection details. Redis credentials are not exposed to the frontend.

## 11. Azure Storage and Blob Storage

An Azure Storage Account with Blob Storage is used as the configured object-storage implementation for the cloud PoC.

Blob Storage can contain:

- Processed source documents.
- Converted document representations.
- Evaluation Report HTML.
- Global reference content such as Company Information where configured.
- Other generated or processed artifacts supported by the existing storage abstraction.

Not every application artifact is stored as a blob:

- Response Structure content is stored in PostgreSQL in the inspected implementation.
- Bronze Draft content is stored in PostgreSQL in the inspected implementation.
- The Word document is generated on request and returned to the browser as a download.
- Automatic persistence of the exported Word file in Blob Storage or SharePoint is not part of the confirmed PoC workflow.

The backend accesses Blob Storage using a server-side connection string, account key, SAS mechanism, managed identity, or another approved Azure authentication mechanism selected for deployment.

## 12. Local document source for the PoC

SharePoint is not required for the PoC.

The backend supports a configurable local document source:

```text
DOCUMENT_SOURCE=local
```

The local document source supports the same principal functional categories expected by the application:

- Tender documents.
- External tender sources.
- Standard Texts.
- Golden Standards.

The local source is used by backend document operations. In an Azure Web App deployment, the document location must be available to the backend process through the chosen deployment package, mounted storage, temporary staging mechanism, or another configured source compatible with the local adapter.

The exact persistence and population mechanism for local PoC documents must be confirmed as part of backend deployment.

## 13. SharePoint and Microsoft Graph

The recycled project contains SharePoint and Microsoft Graph integrations.

SharePoint access uses backend client credentials rather than the frontend user's token. The backend implementation uses an application credential flow against Microsoft Graph.

For the PoC:

```text
DOCUMENT_SOURCE=local
USE_SHAREPOINT_PROMPTS=false
```

This disables the normal SharePoint document source and prevents the prompt loader from trying to retrieve prompt documents from SharePoint.

The existing SharePoint implementation remains in the codebase but is not required for the PoC runtime path.

## 14. Azure AI Search

Azure AI Search provides searchable and vectorized knowledge for the backend workflows.

Indexed content can include:

- Current tender document chunks.
- External tender-source chunks.
- Standard Text chunks.
- Golden Standard chunks.

Azure AI Search supports:

- Retrieval of tender evidence for the Evaluation Report.
- Retrieval of relevant tender evidence during Bronze generation where requested by the workflow.
- Retrieval of Standard Texts during Bronze generation.
- Retrieval of Golden Standards during Bronze generation.
- Retrieval of selected tender documents for Chat.

The backend performs the indexing and retrieval operations. The Azure AI Search admin key, API key, endpoint, index names, and embedding configuration remain server-side.

The frontend does not call Azure AI Search directly.

## 15. Embedding services

The application requires an embedding service to convert searchable text and queries into vector representations.

The current codebase supports a configurable embedding path. Depending on environment configuration, the PoC can use:

- The Ayvens ALD embedding service.
- A configured Azure OpenAI embedding deployment.

The embedding service is called by the backend during:

- Document indexing.
- Semantic retrieval.
- Standard Text indexing.
- Golden Standard indexing.
- Search-query preparation.

Embedding API keys, subscription keys, endpoints, model deployment names, and API versions are backend settings.

## 16. Generative AI services

The application requires generative AI services for the main inference workflows.

Depending on configuration, the PoC can use:

- The Ayvens ALD model gateway or compatible model service.
- Direct Azure OpenAI deployments.

The backend selects the configured provider and model for each operation.

Generative AI is used for:

- Tender narrative analysis.
- Opportunity and risk analysis.
- Recommendations.
- Structured tender-information extraction.
- Required-document extraction.
- Award-criteria extraction where applicable.
- Clarification-question generation.
- Response Structure generation.
- Bronze answer generation.
- Chat responses.
- Targeted rewriting and editing support.

The frontend does not call the generative AI services directly.

API keys, subscription keys, endpoints, model deployment identifiers, and model configuration are provided to the backend through server-side configuration or secrets.

## 17. Azure AI Document Intelligence

Azure AI Document Intelligence is a conditional backend dependency used when a document format or extraction path requires the service.

Its role is to support extraction and normalization of content from documents that cannot be handled adequately by local converters alone.

Possible document-processing paths include:

- PDF extraction.
- DOCX conversion and extraction.
- Excel conversion to an analyzable representation.
- HTML extraction.
- Azure AI Document Intelligence extraction where configured.

The backend stores and indexes the resulting extracted text.

Document Intelligence credentials remain server-side.

## 18. Object storage and document-processing sequence

The backend document-processing path is conceptually:

```text
Local PoC source files
→ Backend synchronization
→ Format conversion and text extraction
→ PostgreSQL tender-file records
→ Processed object storage in Azure Blob Storage
→ Chunking and embeddings
→ Azure AI Search indexing
```

PostgreSQL, Blob Storage, and Azure AI Search are separate stores with different responsibilities:

- PostgreSQL stores business and workflow records.
- Blob Storage stores processed files and selected generated or global content.
- Azure AI Search stores searchable chunks and vectors.
- Redis stores transient progress and locking data.

## 19. Main AI-generated artifacts

### 19.1 Evaluation Report

The Evaluation Report is generated from tender sources and configured narrative context.

It can contain:

- Tender summary.
- Opportunities.
- Risks.
- Recommendations.
- Structured tender information.
- Required documents.
- Proof documents and award criteria where applicable.
- Clarification questions.
- An extracted-field coverage or completeness percentage.

Its principal confirmed inputs are:

- Current tender documents.
- Optional external tender sources.
- Company Information for narrative analysis and recommendations.
- Workflow-specific prompts.

Standard Texts and Golden Standards are not confirmed direct inputs to the Evaluation Report.

The Report metadata is stored in PostgreSQL. Report HTML is stored using the configured object-storage implementation.

### 19.2 Response Structure

The Response Structure is generated from selected tender documents.

Its purpose is to identify:

- Questions.
- Requirements.
- Numbering and wording that should be preserved.
- Response guidance for each answer section.

The Structure is stored in PostgreSQL.

The Evaluation Report does not automatically generate the Response Structure in the current implementation.

### 19.3 Bronze Draft

The Bronze Draft is the initial generated response document.

Its confirmed inputs include:

- The Response Structure.
- Current tender evidence where the workflow decides retrieval is needed.
- Standard Texts.
- Golden Standards of the relevant type.
- Drafting prompts and model configuration.

The Bronze Draft is stored in PostgreSQL as a versioned working artifact.

The Evaluation Report does not automatically feed Bronze generation in the current implementation. Report insights influence later work through user review rather than a confirmed direct backend data dependency.

## 20. Standard Texts, Golden Standards, and Company Information

### 20.1 Standard Texts

Standard Texts provide reusable company wording and recurring response content.

Standard Texts are:

- Loaded from the configured source.
- Processed and indexed.
- Stored as reusable global knowledge.
- Retrieved during Bronze answer generation.

Standard Texts support drafting. They are not currently treated as a deterministic service catalogue or formal rule engine.

### 20.2 Golden Standards

Golden Standards provide reference response patterns from prior tender material.

Golden Standards are:

- Loaded from the configured source.
- Processed and indexed separately from Standard Texts.
- Classified by the relevant tender type where the implementation expects that distinction.
- Retrieved during Bronze answer generation.

Golden Standards support drafting patterns. They are not a formal quantitative positioning or win-probability model.

### 20.3 Company Information

Company Information provides organization context, strengths, and capabilities.

Its confirmed direct use is in narrative Evaluation Report analysis and recommendations.

Company Information is not a confirmed direct input to Response Structure or Bronze generation in the inspected implementation.

## 21. Chat and progress communication

### 21.1 Chat

The backend supports several Chat contexts:

- Tender Chat over selected tender documents.
- Report Chat over the latest Evaluation Report, optionally enriched with selected tender documents.
- Bronze Chat over selected sections of the latest Bronze Draft, optionally enriched with selected tender documents.

There is no confirmed dedicated Structure Chat mode.

Chat answers are generated by the backend. Chat informs the user and does not autonomously update the Report, Structure, or Bronze Draft.

### 21.2 Streaming Chat responses

The frontend receives Chat responses through a streamed HTTP response.

The backend generates the answer and replays it incrementally to the frontend. APIM must preserve the streaming behavior without buffering the complete response before forwarding it.

### 21.3 Progress events

Long-running operations expose progress events through Server-Sent Events.

The frontend uses `@microsoft/fetch-event-source`, allowing custom headers such as the APIM subscription key.

The request path is:

```text
Frontend progress client
→ APIM with subscription key
→ Backend progress endpoint
→ Redis progress state and process-local event handling
```

APIM, App Service, and any intermediate proxy must permit a sufficiently long connection and avoid response buffering that would prevent incremental updates.

## 22. Word export

The final working document is exported from the current Bronze content.

The flow is:

```text
Frontend requests Word export
→ APIM validates the subscription key
→ Backend loads the relevant Bronze content from PostgreSQL
→ Backend converts the Bronze Markdown into DOCX
→ Backend returns the DOCX response
→ Browser downloads the file
```

The generated Word document is not confirmed as a persistently stored backend artifact.

Automatic SharePoint publication is not part of the confirmed PoC flow.

## 23. Backend secrets and configuration

Backend secrets must remain outside the frontend bundle.

Expected backend secrets and sensitive configuration can include:

- PostgreSQL credentials or connection string.
- Redis connection string or password.
- Azure Storage connection string or equivalent credential.
- Azure AI Search key.
- Azure OpenAI key.
- ALD API keys and subscription keys.
- Azure AI Document Intelligence key.
- SharePoint client secret if SharePoint is enabled in another environment.
- Any service-specific certificates or private credentials.

The preferred Azure deployment pattern is to store these values in Azure Key Vault and expose them to the Azure Web App by managed identity and Key Vault references, or through another approved server-side secret-injection mechanism.

The PoC frontend APIM subscription key is an explicit exception because it is accepted as browser-visible for this temporary environment.

## 24. Network and connectivity requirements

### 24.1 Databricks App to APIM

The user's browser calls the public Ayvens staging APIM hostname.

Requirements include:

- Corporate network and browser access to the Databricks App URL.
- Corporate network and browser access to `api.staging.aldautomotive.com`.
- CORS permission for the Databricks App origin.
- APIM subscription-key acceptance.

### 24.2 APIM to Azure Web App

APIM must reach the backend Web App.

The final configuration can use:

- A restricted public backend endpoint.
- APIM IP allowlisting.
- Private networking.
- Private endpoint integration.
- Another approved Azure connectivity model.

The exact choice remains a deployment and networking decision.

### 24.3 Backend to managed services

The backend requires network access to:

- PostgreSQL.
- Redis.
- Azure Blob Storage.
- Azure AI Search.
- Azure OpenAI or the ALD model gateway.
- Embedding services.
- Azure AI Document Intelligence.
- JFrog only if the backend deployment installs dependencies from an internal Python repository.
- Microsoft Graph only when SharePoint functions are enabled.

Firewall rules, private endpoints, DNS resolution, outbound allowlists, TLS certificates, and service-specific network policies must match the selected deployment design.

## 25. Observability and operational information

The PoC should make operational information available from both hosting environments.

### Databricks App

Relevant operational information includes:

- Deployment logs.
- Frontend runtime logs.
- App startup failures.
- Dependency-installation failures.
- Access permissions and deployment history.

### Azure Web App

Relevant operational information includes:

- Application logs.
- Uvicorn or FastAPI startup logs.
- HTTP request failures.
- Exceptions from database, Redis, storage, search, and AI calls.
- Health checks.
- Resource metrics.
- Optional Application Insights integration.

### APIM

Relevant operational information includes:

- Subscription validation failures.
- Backend connectivity failures.
- CORS failures.
- Timeouts.
- Request and response status codes.
- Streaming and long-running request behavior.

## 26. Environment ownership and responsibilities

### Azure Databricks/Data Science staging environment

Responsible for:

- Hosting the frontend Databricks App.
- Controlling who can use or manage the app.
- Building the frontend.
- Resolving npm dependencies through JFrog.
- Supplying build-time secrets required by the Databricks deployment.

### Ayvens staging API Management environment

Responsible for:

- Publishing the PoC API.
- Managing the API product or subscription.
- Validating the APIM subscription key.
- Applying CORS and gateway policies.
- Routing accepted requests to the backend.

### Azure PoC subscription

Responsible for:

- Hosting the FastAPI backend.
- Hosting PostgreSQL.
- Hosting Redis or an approved compatible service.
- Hosting Blob Storage.
- Hosting or connecting to Azure AI Search.
- Hosting or connecting to Azure OpenAI and Document Intelligence.
- Managing backend secrets and networking.
- Providing observability for backend services.

## 27. Current-versus-planned status

### Already demonstrated or in progress

- The frontend has been deployed successfully as a Databricks App.
- The Databricks App URL is accessible to authorized users.
- npm dependencies are installed through JFrog.
- The JFrog token is supplied through a Databricks App secret resource.
- Databricks protects access to the frontend.
- The application code supports React, FastAPI, PostgreSQL, Redis, object storage, Azure AI Search, AI services, and document extraction.
- Local document-source support exists in the backend.
- The application can generate Evaluation Reports, Response Structures, and Bronze Drafts in the assessed environment.

### Planned for the PoC deployment

- Deploy the FastAPI backend to an Azure Web App.
- Publish the backend through the Ayvens staging APIM instance.
- Create or assign a dedicated APIM subscription for the PoC.
- Configure the frontend to call the APIM URL.
- Add `Ocp-Apim-Subscription-Key` centrally to frontend requests.
- Enable explicit frontend and backend demo authentication modes.
- Configure the managed PostgreSQL service.
- Configure Redis or the selected Redis-compatible service.
- Configure the Azure Storage Account and Blob containers.
- Configure Azure AI Search.
- Configure AI generation and embedding services.
- Configure Document Intelligence if required by the selected document types.
- Configure local document-source content for the PoC.
- Disable SharePoint prompts and SharePoint document access.
- Validate CORS, streaming, Word export, and long-running operations through APIM.

### Not part of the PoC target

- Production-grade end-user authentication and authorization.
- Tender-level RBAC.
- Individual data ownership.
- Formal approval workflow.
- Production-scale concurrency validation.
- Public anonymous frontend access.
- Automatic SharePoint publication of the final Word document.
- A production secret-management pattern for browser-visible APIM credentials.
- Replacement of the existing Entra implementation.

## 28. Principal PoC security assumptions

The PoC relies on layered but limited controls:

1. Databricks App permissions control who can open the frontend.
2. The APIM subscription key controls which consumer can call the PoC API.
3. The backend demo mode creates or reuses one shared application identity.
4. Backend service credentials remain server-side.
5. The PoC does not provide fine-grained user authorization.
6. The APIM key is considered browser-visible and low sensitivity.
7. The PoC API subscription should be isolated and revocable.
8. The PoC should not use production data unless the environment is approved for that data.
9. Demo mode must be explicitly restricted to a PoC environment.
10. The architecture must not be presented as a production authentication design.

## 29. End-to-end runtime sequences

### 29.1 Opening the application

```text
User opens the Databricks App URL
→ Databricks authenticates the user
→ Databricks checks App permissions
→ Databricks serves the React frontend
→ Frontend starts in demo mode without MSAL
```

### 29.2 Loading tender data

```text
React frontend calls the APIM Tender API
→ Frontend includes Ocp-Apim-Subscription-Key
→ APIM validates the subscription
→ APIM forwards the request to the Azure Web App
→ FastAPI demo authentication resolves the shared demo user
→ FastAPI queries PostgreSQL
→ FastAPI returns tender data through APIM
```

### 29.3 Synchronizing local tender documents

```text
User starts synchronization
→ Frontend calls APIM
→ FastAPI uses the configured local document source
→ FastAPI reads tender and external files
→ FastAPI converts and extracts document content
→ FastAPI persists TenderFile records in PostgreSQL
→ FastAPI stores processed files in Blob Storage
→ FastAPI creates chunks and embeddings
→ FastAPI uploads searchable chunks to Azure AI Search
→ Redis records progress
→ Frontend receives progress events through APIM
```

### 29.4 Generating the Evaluation Report

```text
User starts Report generation
→ Frontend calls APIM
→ FastAPI retrieves relevant tender evidence from Azure AI Search
→ FastAPI uses configured prompts and AI services
→ FastAPI assembles narrative and structured Report sections
→ FastAPI calculates extracted-field coverage
→ FastAPI stores Report metadata in PostgreSQL
→ FastAPI stores Report HTML in object storage
→ Frontend displays the Evaluation Report
```

### 29.5 Generating the Response Structure

```text
User selects tender documents
→ Frontend calls APIM
→ FastAPI reads selected TenderFile content
→ FastAPI calls the configured AI service
→ FastAPI creates the Response Structure
→ FastAPI stores the Structure in PostgreSQL
→ Frontend displays the Structure
```

### 29.6 Generating the Bronze Draft

```text
User starts Bronze generation
→ Frontend calls APIM
→ FastAPI loads the selected or current Response Structure
→ FastAPI retrieves Standard Texts from Azure AI Search
→ FastAPI retrieves Golden Standards from Azure AI Search
→ FastAPI conditionally retrieves current tender evidence
→ FastAPI calls the configured generation service for each response section
→ FastAPI stores the Bronze version in PostgreSQL
→ Frontend displays the Bronze Draft
```

### 29.7 Chat

```text
User asks a Chat question
→ Frontend sends the question and current Chat history through APIM
→ FastAPI selects the relevant Chat context
→ FastAPI can retrieve selected tender-document evidence
→ FastAPI calls the configured AI service
→ FastAPI stores user and assistant messages in PostgreSQL
→ FastAPI streams the response through APIM
→ Frontend displays incremental text
```

### 29.8 Word export

```text
User requests Word export
→ Frontend calls APIM with the subscription key
→ FastAPI loads Bronze content from PostgreSQL
→ FastAPI converts Markdown into DOCX
→ FastAPI returns the Word file
→ Browser downloads the reviewable response document
```

## 30. Information still to be finalized

The following items should be supplied from the deployment configuration when available:

- Azure subscription name and ID.
- Resource group names.
- Azure region.
- Azure Web App name and App Service Plan.
- Backend runtime version and startup command.
- PostgreSQL service type, server, database, and network model.
- Redis service type, endpoint, and network model.
- Storage Account and Blob container names.
- Azure AI Search service and index names.
- Azure OpenAI resource, deployment names, and API versions.
- ALD endpoints and selected model routes.
- Azure AI Document Intelligence resource.
- Azure Key Vault name.
- APIM API identifier, product, subscription, policy, and backend mapping.
- Exact Databricks App URL.
- Exact CORS origins and exposed headers.
- Backend health endpoint.
- Secret-injection method for the Azure Web App.
- Local document-source population method in the Azure-hosted backend.
- Monitoring, alerting, and retention configuration.
