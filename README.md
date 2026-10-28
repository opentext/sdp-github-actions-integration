## 1. Introduction 🚀

In the following documentation, the **OpenText Core Software Delivery Platform** and **OpenText Software Delivery Management** will collectively be referred to as 'the product'.

This is a custom GitHub Action which facilitates communication between GitHub and the product (formerly known as ALM Octane/ValueEdge) regarding CI/CD. The action will monitor an automation workflow and will reflect it into the product.

## 2. Table of Contents

- [1. Introduction](#1-introduction-)
- [2. Table of Contents](#2-table-of-contents)
- [3. Requirements](#3-requirements)
- [4. Workflow Configuration](#4-workflow-configuration)
  - [4.1. Example Workflow Configuration](#41-example-workflow-configuration)
  - [4.2. Pipeline name pattern](#42-pipeline-name-pattern)
    - [4.2.1. Preserving existing pipeline names](#421-preserving-existing-pipeline-names)
    - [4.2.2. Flat pipeline mode (no branch/child pipelines)](#422-flat-pipeline-mode-no-branchchild-pipelines)
    - [4.2.3. Custom run/build labels](#423-custom-runbuild-labels)
    - [4.2.4. Tracking quality per microservice or group of microservices](#424-tracking-quality-per-microservice-or-group-of-microservices)
  - [4.3. Test Level and Test Type of JUnit test results](#43-test-level-and-test-type-of-junit-test-results)
  - [4.4. Injecting Gherkin (BDD) test results](#44-injecting-gherkin-bdd-test-results)
  - [4.5. Debugging](#45-debugging)
- [5. Credential Configuration](#5-credential-configuration-into-the-product)
  - [5.1. Creating a GitHub App](#51-creating-a-github-app)
  - [5.2. Installing a GitHub App to specific repositories](#52-installing-a-github-app-to-specific-repositories)
  - [5.3. Configure the credential into the product](#53-configure-the-credential-into-the-product)
- [6. Running Automated Tests](#6-running-automated-tests-from-the-product)
- [7. OpenText Functional Testing](#7-opentext-functional-testing-framework)
- [8. Limitations](#8-limitations)
  - [8.1. Duplicate Workflow Run Protection](#81-duplicate-workflow-run-protection)
- [9. Change log](#9-change-log)
  - [Unreleased](#unreleased)
  - [v26.4.0](#v2640)
  - [v26.2.2](#v2622)
  - [v26.2.1](#v2621)
  - [v26.2.0](#v2620)
  - [v25.2.1](#v2521)
  - [Older versions](#v2520)

## 3. Requirements

- At least one GitHub Actions runner allocated for running the integration.
- The product version should be **16.1.200** or **higher** for unidirectional integration (GitHub to product only). 
  - **For bidirectional communication** (running pipelines or automated tests from the product, configuring external credentials for GitHub), the product version must be **25.1.8 or higher**. This is required because earlier versions have a limitation on credential password length (100 characters), which is insufficient for GitHub App private keys (~1500 characters).
- API access to the product with **CI/CD Integration** or **DevOps Admin** roles.
- The integration workflow requires the following minimum `permissions` to be declared (at the workflow or job level):

  ```yaml
  permissions:
    actions: read       # Required to read workflow run details and, when using the test runner feature, to dispatch new workflow runs triggered from the product
    contents: read      # Required to read repository contents, branches, and commit data for SCM injection
    pull-requests: read # Required to read pull request data when the pull_request event is used
  ```

> [!NOTE]
> For **private repositories**, GitHub additionally requires you to set the default `GITHUB_TOKEN` permissions to **Read and write** under `Settings -> Actions -> General`. This is because the `actions` scope is not accessible with the default read-only token on private repositories.

## 4. Workflow Configuration
> [!NOTE]
> These steps should be done inside your GitHub repository.

- Create a new workflow (.yml file).
- Add `workflow_run` trigger on the desired workflow(s) on request and complete events.
- Add `pull_request` event trigger to also notify the integration of any PR related event.

```yaml
on:
  workflow_run:
    workflows: [<workflow_name1>, <workflow_name2>, ...]
    types: [requested, in_progress, completed]
  pull_request:
    types: [opened, edited, closed, reopened]
```
- If the product is configured on HTTPS with a self-signed certificate, configure node to allow requests to the server.

```yaml
env: 
    NODE_TLS_REJECT_UNAUTHORIZED: 0
```
- Add a job for the product's integration and configure details about the runner.
- Configure two secret variables named `SDP_CLIENT_ID` and `SDP_CLIENT_SECRET` with the credential values, inside your GitHub repository (more details about
secret variables configuration [here](https://docs.github.com/en/actions/security-guides/encrypted-secrets)).
- Set integration config params (the product's URL, Shared Space, Workspace, credentials) and repository (Token and URL).
- Set `unitTestResultsGlobPattern` to match desired **JUnit** test results path or set `gherkinTestResultsGlobPattern` to match **Gherkin (BDD)** test results path ([see more](#injecting-gherkin-bdd-test-results)).
- For Private repositories go to ```Settings -> Actions -> General``` and set your GITHUB_TOKEN permissions to Read and write. This is necessary to access the actions scope. (more details about GITHUB_TOKEN permissions [here](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token))

```yaml
jobs:
  sdp_integration_job:
    runs-on: <runner_tags>
    name: SDP-Integration#${{github.event.action}}#${{github.event.workflow_run.id}}
    steps:
      - name: Publish to OpenText SDP
        uses: opentext/sdp-github-actions-integration
        id: gitHubActionsIntegration
        with:
          octaneUrl: <alm_octane_URL>
          octaneSharedSpace: <alm_octane_shared_space>
          octaneWorkspace: <alm_octane_workspace>
          octaneClientId: ${{secrets.SDP_CLIENT_ID}}
          octaneClientSecret: ${{secrets.SDP_CLIENT_SECRET}}
          githubToken: ${{secrets.GITHUB_TOKEN}}
          serverBaseUrl: <github_repository_URL>
          pipelineNamePattern: '${workflow_name}'
          unitTestResultsGlobPattern: <pattern_for_junit_test_result_path>
          gherkinTestResultsGlobPattern: <pattern_for_gherkin_test_result_path>
```

### 4.1. Example Workflow Configuration

Example of complete integration workflow configuration file:

```yaml
name: OpenText Software Delivery Platform Integration
# Events the integration should be triggered on
on:
  pull_request:
    types: [opened, edited, closed, reopened]
  workflow_run:
    # List of workflows to integrate with OpenText Core SDP / SDM
    workflows: [CI]
    # For automated tests, the requested and in_progress types are not required
    types: [requested, in_progress, completed]
# Node configuration for allowing HTTPS requests
env: 
    NODE_TLS_REJECT_UNAUTHORIZED: 0
# Minimum required permissions for the integration workflow
permissions:
  actions: read
  contents: read
  pull-requests: read
jobs:
  sdp_integration_job:
    # List of runner tags
    runs-on: [self-hosted]
    name: SDP-Integration#${{github.event.action}}#${{github.event.workflow_run.id}}
    steps:
      - name: Publish to OpenText SDP
        # Reference to our public GitHub action
        uses: opentext/sdp-github-actions-integration
        id: gitHubActionsIntegration
        # Config parameters for the integration
        with:
          # OpenText Core SDP / SDM connection data
          octaneUrl: 'http://myOctaneUrl.com'
          octaneSharedSpace: 1001
          octaneWorkspace: 1002
          octaneClientId: ${{secrets.SDP_CLIENT_ID}}
          octaneClientSecret: ${{secrets.SDP_CLIENT_SECRET}}
          # Automatically provided GitHub token
          githubToken: ${{secrets.GITHUB_TOKEN}}
          # The url that the CI Server in OpenText Core SDP will point to
          serverBaseUrl: https://github.com/MyUser/MyCustomRepository
          # Pattern for building the name of the pipeline (see README for full list of placeholders)
          pipelineNamePattern: '${workflow_name}'
          # Pattern for identifying JUnit style report files for test result injection in OpenText Core SDP
          unitTestResultsGlobPattern: "**/*.xml"
```

- In order to save the parameters of the pipelines and reflect them in the product, update your pipeline's configuration to contain this step in one of the pipeline's jobs:

```yaml
    - name: Log workflow execution parameters
      run: |
        echo "execution_parameter:: $(echo '${{ toJson(github.event.inputs) }}' | jq -c .)"
```

- To disable the **deployment lock mechanism** (which prevents duplicate workflow runs when a multi-job upstream workflow triggers the integration multiple times), set the `SDP_ENABLE_DEPLOYMENT_LOCK` environment variable to `false` in the integration job. By default, this feature is **enabled** to prevent duplicate CI events in the product:

```yaml
  sdp_integration_job:
    runs-on: <runner_tags>
    env:
      SDP_ENABLE_DEPLOYMENT_LOCK: false  # Optional: set to false to disable duplicate run protection
    steps:
      - name: Publish to OpenText SDP
        uses: opentext/sdp-github-actions-integration
        ...
```

- Run the desired workflow(s) from Actions Tab. This will create a new CI Server and pipeline inside the product, reflecting the status of the executed workflow.

### 4.2. Pipeline name pattern

- The `pipelineNamePattern` parameter from the integration workflow configuration represents the format of the pipeline name that will be displayed in the product.

- This parameter can contain any combination of the following placeholders:
1. `${repository_name}` - the name of the repository
2. `${repository_owner}` - the name of the account or organization owning the repository.
3. `${workflow_name}` - the name of the workflow.
4. `${workflow_file_name}` - the name of the workflow's configuration file.

- Example: `NEW - ${repository_name} - ${workflow_name}`

#### 4.2.1. Preserving existing pipeline names

- By default, whenever a pipeline is created or updated, the integration searches for any other pipelines sharing the same root job CI ID and renames them to match the currently resolved `pipelineNamePattern`. This keeps a single pipeline in sync when its name changes over time.
- If `pipelineNamePattern` resolves to a **different name across separate workflow runs that share the same root job CI ID** (for example, a name computed dynamically per component or matrix job), this automatic renaming can incorrectly rename or reuse an unrelated pipeline.
- To prevent this, set the optional `preservePipelineNames` parameter to `true`. When enabled, the integration will still create or retrieve the pipeline using the current `pipelineNamePattern`, but it will **not** rename any other existing pipelines.
- This parameter is **optional** and defaults to `false`, preserving the existing renaming behavior for backward compatibility.
- When enabled, the plugin also namespaces the underlying job/build CI ID by the resolved (parent) pipeline name, so that different pipelines sharing the same GitHub workflow file get fully independent CI identities (preventing them from colliding on the same underlying job/build). The same CI ID is used for the `requested`, `in_progress` and `completed` events of a run.

> [!IMPORTANT]
> Because the CI ID changes when this option is enabled, the first run afterwards creates a **new** pipeline in the product; the history of the previous pipeline is not migrated. Likewise, changing the resolved pipeline name later creates a new pipeline instead of renaming the existing one.

```yaml
with:
  ...
  pipelineNamePattern: '${workflow_name}'
  preservePipelineNames: 'true'
```

#### 4.2.2. Flat pipeline mode (no branch/child pipelines)

- By default, when a workflow run starts (`in_progress`), the integration creates a **branch/child pipeline** under the parent (e.g. `my-pipeline/main`) and reports the run against it, so per-branch history and live job/step progress are tracked separately from the parent pipeline.
- If you don't need per-branch pipeline tracking (for example, you just want test results grouped per pipeline/component, without live progress tracking), set the optional `flatPipelineMode` parameter to `true`. When enabled:
  - No branch/child pipeline is ever created; the run is reported directly against the parent pipeline.
  - Live job/step progress polling still runs as normal during `in_progress` (unaffected).
  - If your workflow only sends the `completed` event (omitting `requested` and `in_progress` from the `workflow_run` `types:` list), the integration will create the pipeline on first use if it doesn't already exist, and will send both a `started` and `finished` event for that run — so a `completed`-only setup works out of the box.
  - The `completed` event always sends a `started` event before `finished`. If `in_progress` is also configured, the build therefore receives a second `started` event with the same build ID and start time, which simply updates the existing build.
  - The job/build CI ID is namespaced by the resolved pipeline name and existing pipelines are never renamed, exactly as with [`preservePipelineNames`](#421-preserving-existing-pipeline-names) (including the note about new pipelines being created when the option is first enabled).
- This parameter is **optional** and defaults to `false`, preserving the existing branch/child pipeline behavior for backward compatibility.

```yaml
with:
  ...
  pipelineNamePattern: '${workflow_name}'
  flatPipelineMode: 'true'
```

> [!TIP]
> If your `workflow_run` trigger only includes `completed` (no `requested`/`in_progress`), you must set `flatPipelineMode: 'true'` for the pipeline to be created and reported correctly.

#### 4.2.3. Custom run/build labels

- By default, each run/build in the product is labeled with just the GitHub Actions run number (e.g. `#44`).
- If you group multiple distinct components/microservices under a single pipeline (for example, using a constant `pipelineNamePattern` together with `flatPipelineMode`), it can be useful to distinguish each run by which component produced it. Set the optional `runNamePattern` parameter to an already-resolved label (e.g. a component/microservice name) to prefix the run number: `<runNamePattern>#<run_number>`.
- This parameter expects an **already-resolved plain string** (like `pipelineNamePattern`), not a template — resolve any dynamic value in your calling workflow before passing it in.
- This parameter is **optional**. If not set, runs keep the default label (just the run number).

```yaml
with:
  ...
  pipelineNamePattern: 'module-name'
  flatPipelineMode: 'true'
  runNamePattern: 'microservice-name'
```

> [!NOTE]
> This is an experimental option — verify in the product's UI that the run label renders as expected for your version, since the exact display format is controlled by the product, not this integration.

#### 4.2.4. Tracking quality per microservice or group of microservices

Pipeline dashboards and widgets in the product (e.g. pipeline run history, test run results, failure analysis) are scoped per pipeline. To get a dashboard per microservice, or per group of microservices, each one needs a stable pipeline of its own, even when several services are built by the same (reusable) GitHub workflow. Two setups are supported:

**A. One pipeline per microservice.** Resolve `pipelineNamePattern` to the service name and enable `preservePipelineNames`, so that each service gets its own pipeline and the services never rename each other's pipeline. For example, if the upstream workflow sets `run-name: ${{ inputs.service }}`:

```yaml
with:
  ...
  pipelineNamePattern: '${{ github.event.workflow_run.display_title }}'
  preservePipelineNames: 'true'
  testLevel: 'Integration Test'
  testType: 'Regression'
```

**B. One pipeline per group of microservices.** Resolve `pipelineNamePattern` to the group (module) name, enable `flatPipelineMode` so that all runs land directly in that single pipeline, and set `runNamePattern` to the service name so each run shows which service produced it:

```yaml
with:
  ...
  pipelineNamePattern: 'payments-module'
  flatPipelineMode: 'true'
  runNamePattern: '${{ github.event.workflow_run.display_title }}'
```

In both setups, use [`testLevel` / `testType`](#43-test-level-and-test-type-of-junit-test-results) to classify the injected test results, so that dashboard widgets can be filtered by test level and type.

### 4.3. Test Level and Test Type of JUnit test results

- By default, the injected **JUnit** test results are reported with `Test_Level` = `Unit Test` and `Test_Type` = `Sanity`.
- Set the optional `testLevel` and/or `testType` parameters to override these values (e.g. `System Test`, `Functional`). Each parameter is applied independently; when a parameter is not set, the default value is kept.
- The values should match existing values of the corresponding lists in the product.
- The `Framework` field is not affected and is still derived from `testingFramework`. Gherkin (BDD) test results are not affected either.

```yaml
with:
  octaneUrl: ...
  octaneSharedSpace: ...
  octaneWorkspace: ...
  octaneClientId: ...
  octaneClientSecret: ...
  gitHubToken: ...
  serverBaseUrl: ...
  pipelineNamePattern: '${workflow_name}'
  unitTestResultsGlobPattern: 'results.xml'
  testingFramework: 'robotFramework'
  testLevel: 'System Test'
  testType: 'Functional'
```

### 4.4. Injecting Gherkin (BDD) test results

- To inject **Gherkin** test results, follow these steps:
  1. The automation workflow must contain an additional step for converting the BDD test results to a format accepted by the product. This step must run the [bdd2octane](https://github.com/MicroFocus/bdd2octane?tab=readme-ov-file#a-tool-that-enables-importing-bdd-test-results-into-alm-octane) tool.
  ```yaml
  - name: Convert BDD test results
    run: mvn com.microfocus.adm.almoctane.bdd:bdd2octane:run -DreportFiles="**/target/surefire-reports/*.xml" -DfeatureFiles="**/src/test/resources/features/*.feature" -Dframework="cucumber-jvm" -DresultFile="target/surefire-reports/cucumber-jvm-result.xml"
  ```
  2. Set up the `gherkinTestResultsGlobPattern` parameter in the integration workflow to match the converted test results.

### 4.5. Debugging

- In order to get more information on the execution of the integration workflow, add this parameter for the integration job: `logLevel: '3'`.
- These are the available values for this parameter:
  - `1` - trace level
  - `2` - debug level
  - `3` - info level
  - `4` - warning level
  - `5` - error level

## 5. Credential Configuration into the product

> [!IMPORTANT]
> **Minimum version requirement**: This feature requires the product version **25.1.8 or higher**. Earlier versions cannot store the GitHub App private key due to password field length limitations (100 characters vs. ~1500 characters required). Without this configuration, the integration will be unidirectional (GitHub to product only).

- To use certain features, the product needs to send requests to GitHub. This requires configuring a GitHub App credential and adding it to the application.

> [!IMPORTANT]
> The GitHub App must be created and installed on the **organization or account that owns the repository** you want to integrate. Installing it on an account that merely has access to the repository (e.g. a collaborator or member account) is not sufficient - it must be the owning organization or account of that repository.

### 5.1. Creating a GitHub App

1. On GitHub, go to your organization (or account, if the repository containing the workflows is owned by an account) settings.
2. In the left-side menu, go to **Developer Settings -> GitHub Apps**.
3. Create a new GitHub App by clicking on **New GitHub App**.
4. In the **GitHub App name** field, enter a name of your choice.
5. In the **Homepage URL** field, enter the URL of the Opentext Software Delivery Platform.
6. In the **Webhook** section, uncheck the **Active** option. No webhook is needed.
7. In the **Permissions** section, grant the following repository permissions:
  - Actions: Read and write
  - Content: Read-only
8. Click on the **Create GitHub App** button at the bottom of the page. Leave any other fields unchanged.

### 5.2. Installing a GitHub App to specific repositories

1. On GitHub, go to your organization (or account, if the repository containing the workflows is owned by an account) settings.
2. Go to **Developer settings -> GitHub App**.
3. Select the credential you created in the previous step by clicking on its name.
4. In the left-side menu, go to **Install App**.
5. For the organization (or account) you want to configure the credential for, click on the **Install** button.
6. Select the repositories you want to grant access to: **All repositories** or **Only select repositories**
7. Click on the `Install` button to complete the installation.

### 5.3. Configure the credential into the product

1. On GitHub, go to your organization (or account, if the repository containing the workflows is owned by an account) settings.
2. Go to **Developer Settings -> GitHub Apps** and select the GitHub App you installed by clicking on its name.
3. On the current page, note the value of the **Client ID**.
4. In the **Private keys** section, click on **Generate a private key**. A file containing the private key will be downloaded to your device.
5. Go to the OpenText Software Delivery Platform.
6. Navigate to **Settings -> Spaces** (select the desired workspace containing the CI servers) **-> Credentials**.
7. Create a new credential.
8. Enter a name of your choice. In the **User Name** field, enter the **Client ID** from the GitHub App, and in the **Password** field, enter the private key generated for this GitHub App.
9. Click on the `Add` button to create the credential.
10. In workspace settings, go to **DevOps -> CI Servers**.
11. For the desired CI server (it has the name of the organization on GitHub), double-click on the cell in the **Credential** column and select the newly created credential. If the **Credential** column is not visible, click on the **Choose Columns** button (near the **Filter** button) and make the column visible.

## 6. Running Automated Tests from the product

> [!IMPORTANT]
> **Minimum version requirement**: This feature requires the product version **25.1.8 or higher**. This is needed to store the GitHub App private key credentials and establish bidirectional communication with GitHub Actions.
>
> Before configuring this feature, ensure the following prerequisites are met:
> - **Log workflow execution parameters**: The automation workflow must include the [Log workflow execution parameters](#4-workflow-configuration) step that captures runtime inputs. This step is required for the product to correctly pass and handle test run parameters.
> - **Credential configuration**: A GitHub App credential must be configured in the product as described in [Section 5 — Credential Configuration into the product](#5-credential-configuration-into-the-product). This allows the product to trigger workflows on GitHub.

1. **Configure Workflow Parameters:**
   - Ensure the parameters required for automated tests are properly set up in **automation** workflow as described earlier.
   - The workflow must include the following parameters:
     - `testsToRun` (type: string)
     - `suiteId` (type: number)
     - `suiteRunId` (type: number)
     - `executionId` (type: number)  
   - For numerical parameters, it is recommended to set a default value of `0`.

2. **Configure the `testsToRun` conversion job**:
   - To run the tests selected into the product, include a job for converting the `testsToRun` parameter to a format accepted by your testing framework. This should be done into your automation framework.
   - More details on how to do this step can be found here: [@opentext/sdp-sdm-tests-to-run-conversion](https://github.com/MicroFocus/sdp-sdm-tests-to-run-conversion?tab=readme-ov-file#42-running-the-tool-with-github-actions).

3. **Set Up for GitHub Actions Integration:**
   - To integrate GitHub Actions with the product as a test runner, include the `testingFramework` parameter in your workflow configuration.  
   - The `testingFramework` parameter should be set to one of the following values, based on the testing tool used:

        |  Framework Name               | Parameter Value  |
        |-------------------------------|------------------|
        | Cucumber                      | `cucumber`       |
        | Cucumber with BDD Scenario    | `bddScenario`    |
        | Gradle                        | `gradle`         |
        | JBehave                       | `jbehave`        |
        | JUnit                         | `junit`          |
        | Protractor                    | `protractor`     |
        | Robot Framework               | `robotFramework` |
        | Selenium (TestNG)             | `testNG`         |
        | OpenText Functional Testing   | `uft`            |

   - Based on the test results format, you should configure at least one of the following parameters to see the test results in the product:
     - If you want to inject **JUnit** or **XUnit** test results, set the `unitTestResultsGlobPattern` parameter.
     - If you want to inject **Gherkin (BDD)** test results, set the `gherkinTestResultsGlobPattern` parameter. ([see more](#injecting-gherkin-bdd-test-results))

4. **Run the Workflow:**
   - After completing the configuration, run your workflow. This will create a **test runner entity** in the product.

5. **Link Automated Test Entities:**
   - In the product, navigate to the **Tests** module, and link **Automated Test** entities to the newly created test runner.  
   - Automated test entities can be created in two ways:
     - Manually within the product.
     - Automatically by running tests once in GitHub Actions without configuring the test runner parameters mentioned above (the integration should be configured for the pipeline flow, not the test runner flow).

6. **Create a Test Suite:**
   - In the **Tests** module, create a **Test Suite** entity if you don't have one, then assign the relevant **Automated Test** entities to it.

7. **Run the Automated Tests from the Product:**
   - In the product, select or open the test suite and click `Run`, respectively `Run Suite`.

## 7. OpenText Functional Testing framework

- To configure an automation workflow that runs tests using the OpenText Functional Testing *(formerly UFT One)* framework, follow the steps outlined in the following documentation: [Set Up OpenText Functional Testing](https://github.com/opentext/sdp-github-actions-integration/blob/main/docs/set-up-opentext-functional-testing.md).

## 8. Limitations

- Needs at least one dedicated GitHub runner to execute the integration workflow.
- On each pipeline run, the commits that happened since the previous build in the product will be injected. For that, at least one build needs to exist in the product (the commits will be injected starting from the second run of the workflow with the integration).
- Commits from secondary branches will be injected by running the workflow on the desired branch.
- The Octane GitHub Actions integration does not currently support direct execution or injection of NUnit test results. A workaround is possible by running NUnit tests to produce TRX results, converting the TRX files to JUnit format, publishing the JUnit results within GitHub Actions, and then completing the Octane test run so the results are injected. This allows NUnit test results to appear in Octane until native support is provided.

## 8.1. Duplicate Workflow Run Protection

The integration now includes a **deployment lock mechanism** that automatically prevents duplicate workflow runs when a multi-job upstream workflow triggers the integration multiple times (once for each job start/end). This feature is **enabled by default** and ensures that only one integration workflow processes each upstream workflow run, preventing duplicate CI events in the product.

To disable this feature (if needed for compatibility or specific use cases), set the `SDP_ENABLE_DEPLOYMENT_LOCK` environment variable to `false` in your integration job configuration.

## 9. Change log

### Unreleased

- Added an optional `preservePipelineNames` parameter. When set to `true`, the integration no longer renames existing pipelines that share the same root job CI ID as the currently resolved `pipelineNamePattern`. Defaults to `false` to preserve existing behavior.
- When `preservePipelineNames` or `flatPipelineMode` is enabled, the CI ID used for pipelines/jobs is now namespaced by the resolved (parent) pipeline name, preventing distinct pipelines that share the same GitHub workflow file from colliding on the same underlying job/build CI ID. All `workflow_run` event types of a run resolve to the same pipeline and CI ID.
- Added an optional `flatPipelineMode` parameter. When set to `true`, the integration no longer creates branch/child pipelines and instead reports runs directly against the parent pipeline; supports `workflow_run` triggers configured with only the `completed` event type, or any subset of `requested`/`in_progress`/`completed`. Defaults to `false` to preserve existing behavior.
- Made pipeline creation resilient to concurrent create-on-absence races: if two runs targeting a not-yet-existing pipeline fire close together, the losing request now re-fetches and reuses the pipeline created by the other, instead of diverging into an inconsistent state.
- Added an optional `runNamePattern` parameter to customize the run/build label sent to the product (`<runNamePattern>#<run_number>`), useful when grouping multiple components under a single pipeline. The label is unchanged if not set. Experimental — verify rendering in the product's UI.
- Added optional `testLevel` and `testType` parameters to override the `Test_Level` (default `Unit Test`) and `Test_Type` (default `Sanity`) fields of injected JUnit test results.
- Documented how to track pipeline quality per microservice or group of microservices.

### v26.4.0

- Introduced a **deployment lock mechanism** to prevent duplicate workflow runs when multi-job upstream workflows trigger the integration multiple times.
- The integration now uses GitHub Deployments as atomic locks to ensure only one workflow processes each upstream workflow run, preventing duplicate CI events in the product.
- Added `SDP_ENABLE_DEPLOYMENT_LOCK` environment variable (enabled by default) to control this feature. Set to `false` to disable duplicate run protection if needed.
- Added comprehensive documentation for the duplicate workflow run protection feature in the README.

### v26.2.2

- Upgraded the action runtime from Node.js 20 to Node.js 24, as Node.js 20 has been deprecated by GitHub Actions.

### v26.2.1

- Fixed an issue where `README.md` and `LICENSE` files were not being published to the public repositories during the release pipeline.

### v26.2.0

- Added support for `Custom Build Report`. The integration now automatically sets this URL for automated runs, allowing users to be redirected to the corresponding GitHub Actions job logs.
- Added support for `Custom Test Run Report URL` for automated runs triggered by GitHub Actions test runners. To configure this feature, navigate to the Test Runner in the product and set the corresponding field as described in the [documentation](https://admhelp.microfocus.com/octane/en/latest/Online/Content/UserGuide/how_pipelines_create.htm).
- Introduced CI server validation. A new column, `Integration status`, is now available in the product to display validation results for each CI server. To manually trigger validation, select a CI server from the grid and click the `Validate integration` button.
- Added support for branch names containing `/`.
- Fixed an issue where a new Automated Run was created for each test execution, preventing proper display of previous runs.
- Improved warning messages across the product to make them clearer and more meaningful for users.

### v25.2.1

- Added support for XUnit-formatted test results.
- Added a new value for the `testingFramework` configuration parameter: `robotFramework`
- Fixed issue regarding the injection of test results for automated tests triggered from the product.

### v25.2.0

 - Added support for OpenText Functional Testing *(formerly UFT One)*. See how to configure the automation workflow [here](https://github.com/opentext/sdp-github-actions-integration/blob/main/docs/set-up-opentext-functional-testing.md).
 - Saving the `artifact ID` and `external run ID` for each automated run in the product. The `Test Run Report URL` field in the workflow (pipeline) topology could include these values.
 - Enhanced multi-branch test runner support.

### v25.1.1

 - Added functionality for running automated tests from the product.
 - Added support for injecting Gherkin test results from GitHub Actions.

### v25.1.0

 - Added functionality for saving pipeline parameters in the product.

### v24.4.1
 - Added a new configuration parameter for configuring logging level. It's named `logLevel` and is an optional parameter.
 - Fixed issue with workflows running in serial mode not being fully reflected in the product.

### v24.4.0
 - Added a new configuration parameter for customizing the pipeline's name. (the one displayed in the product)
 - Added migration process for multi-branch pipelines.
 - Added migration process for splitting existing CI servers to per-organization or per-account CI servers.
 - Running GitHub workflows from the OpenText Software Delivery Platform is now available.

### v24.2.0
 - Added support for multi branch pipelines.
 - Fixed issue that caused completion workflows not to finish.
 - Updated Node.js to v20.

### v23.3.0
 - Rebranding.
 - Fixed issue with logs when connection to the product was failing.
 
### v1.0
- Creates CI server and pipelines, and reflects pipeline run status in the product.
- Injects JUnit test results.
- Injects SCM data (commits and branches).
- Injects pull requests on GitHub PR events.