/*
 * Copyright 2022-2025 Open Text.
 *
 * The only warranties for products and services of Open Text and
 * its affiliates and licensors (“Open Text”) are as may be set forth
 * in the express warranty statements accompanying such products and services.
 * Nothing herein should be construed as constituting an additional warranty.
 * Open Text shall not be liable for technical or editorial errors or
 * omissions contained herein. The information contained herein is subject
 * to change without notice.
 *
 * Except as specifically indicated otherwise, this document contains
 * confidential information and a valid license is required for possession,
 * use or copying. If this work is provided to the U.S. Government,
 * consistent with FAR 12.211 and 12.212, Commercial Computer Software,
 * Computer Software Documentation, and Technical Data for Commercial Items are
 * licensed to the U.S. Government under vendor's standard commercial license.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

jest.mock('@actions/github', () => ({
  context: { workflow: 'test-workflow', runId: 1 },
  getOctokit: jest.fn().mockReturnValue({})
}));
jest.mock('./client/githubClient');
jest.mock('./client/octaneClient');
jest.mock('./config/config', () => ({
  getConfig: jest.fn().mockReturnValue({
    logLevel: 3,
    pipelineNamePattern: '${workflow_name}',
    serverBaseUrl: 'https://example.com',
    preservePipelineNames: false
  })
}));
jest.mock('./service/ciEventsService');
jest.mock('./service/pipelineDataService');
jest.mock('./service/scmDataService');
jest.mock('./service/testResultsService');
jest.mock('./service/migrationService');
jest.mock('./service/parametersService');
jest.mock('./service/experimentService');
jest.mock('./service/executorService');
jest.mock('./service/ciJobService');
jest.mock('./service/eventCauseBuilder');
jest.mock('./utils/genericPoller');
jest.mock('./utils/pathFormatter');
jest.mock('./utils/utils', () => ({
  ...jest.requireActual('./utils/utils'),
  sleep: jest.fn().mockResolvedValue(undefined)
}));

import { handleEvent } from './eventHandler';
import GitHubClient from './client/githubClient';
import OctaneClient from './client/octaneClient';
import { getConfig } from './config/config';
import ActionsEvent from './dto/github/ActionsEvent';
import ActionsEventType from './dto/github/ActionsEventType';
import { generateRootCiEvent, getEventType } from './service/ciEventsService';
import {
  buildPipelineName,
  getPipelineData,
  updatePipelineNameIfNeeded
} from './service/pipelineDataService';
import { performMigrations } from './service/migrationService';
import {
  getParametersFromConfig,
  getParametersFromLogs
} from './service/parametersService';
import { updateJobParameters } from './service/ciJobService';
import { Experiment, loadExperiments } from './service/experimentService';
import { appendBranchName, buildJobCiIdPrefix } from './utils/pathFormatter';
import { GenericPoller } from './utils/genericPoller';

const buildEvent = (): ActionsEvent =>
  ({
    repository: { owner: { login: 'owner' }, name: 'repo' },
    workflow: { path: '.github/workflows/build.yml', name: 'Build' },
    workflow_run: {
      id: 123,
      run_started_at: '2024-01-01T00:00:00Z',
      run_number: 1,
      head_branch: 'main',
      event: 'push',
      triggering_actor: { login: 'user' }
    }
  }) as unknown as ActionsEvent;

const mockPipelineData = {
  pipelineId: 'pipeline-id',
  instanceId: 'instance-id',
  buildCiId: '123',
  baseUrl: 'https://example.com',
  rootJobName: 'root-job',
  rootJobId: 'root-job-id'
};

describe('handleEvent - pipeline rename guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (getEventType as jest.Mock).mockReturnValue(
      ActionsEventType.WORKFLOW_QUEUED
    );
    (GitHubClient.getWorkflowRun as jest.Mock).mockResolvedValue({});
    (GitHubClient.getWorkflowRunJobs as jest.Mock).mockResolvedValue([]);
    (OctaneClient.getCiServerOrCreate as jest.Mock).mockResolvedValue({
      instance_id: 'instance-id'
    });
    (OctaneClient.updatePluginVersionIfNeeded as jest.Mock).mockResolvedValue(
      undefined
    );
    (OctaneClient.getOctaneVersion as jest.Mock).mockResolvedValue('25.1.4');
    (buildJobCiIdPrefix as jest.Mock).mockResolvedValue('job-ci-id-prefix');
    (appendBranchName as jest.Mock).mockResolvedValue('job-ci-id-prefix/main');
    (getParametersFromConfig as jest.Mock).mockResolvedValue(undefined);
    (loadExperiments as jest.Mock).mockResolvedValue(undefined);
    (
      Experiment.CUSTOM_BUILD_URL_FOR_GITHUB_ACTIONS.isOn as jest.Mock
    ).mockReturnValue(false);
    (performMigrations as jest.Mock).mockResolvedValue(undefined);
    (buildPipelineName as jest.Mock).mockReturnValue('MyPipeline');
    (getPipelineData as jest.Mock).mockResolvedValue(mockPipelineData);
    (updatePipelineNameIfNeeded as jest.Mock).mockResolvedValue(undefined);
  });

  it('calls updatePipelineNameIfNeeded by default (preservePipelineNames not set)', async () => {
    (getConfig as jest.Mock).mockReturnValue({
      pipelineNamePattern: '${workflow_name}',
      serverBaseUrl: 'https://example.com',
      preservePipelineNames: false
    });

    await handleEvent(buildEvent());

    expect(updatePipelineNameIfNeeded).toHaveBeenCalledWith(
      'job-ci-id-prefix*',
      expect.objectContaining({ instance_id: 'instance-id' }),
      'MyPipeline'
    );
    expect(getPipelineData).toHaveBeenCalledWith(
      'MyPipeline',
      expect.anything(),
      expect.anything(),
      true,
      'job-ci-id-prefix',
      [],
      undefined
    );
  });

  it('skips updatePipelineNameIfNeeded when preservePipelineNames is true', async () => {
    (getConfig as jest.Mock).mockReturnValue({
      pipelineNamePattern: '${workflow_name}',
      serverBaseUrl: 'https://example.com',
      preservePipelineNames: true
    });

    await handleEvent(buildEvent());

    expect(updatePipelineNameIfNeeded).not.toHaveBeenCalled();
    expect(getPipelineData).toHaveBeenCalledWith(
      'MyPipeline',
      expect.anything(),
      expect.anything(),
      true,
      'job-ci-id-prefix',
      [],
      undefined
    );
  });

  it('regression: does not rename an existing pipeline when a second pipelineName shares the same root job CI ID', async () => {
    (getConfig as jest.Mock).mockReturnValue({
      pipelineNamePattern: '${workflow_name}',
      serverBaseUrl: 'https://example.com',
      preservePipelineNames: true
    });

    (buildPipelineName as jest.Mock).mockReturnValueOnce('FirstPipeline');
    await handleEvent(buildEvent());

    (buildPipelineName as jest.Mock).mockReturnValueOnce('SecondPipeline');
    await handleEvent(buildEvent());

    expect(updatePipelineNameIfNeeded).not.toHaveBeenCalled();
    expect(getPipelineData).toHaveBeenNthCalledWith(
      1,
      'FirstPipeline',
      expect.anything(),
      expect.anything(),
      true,
      'job-ci-id-prefix',
      [],
      undefined
    );
    expect(getPipelineData).toHaveBeenNthCalledWith(
      2,
      'SecondPipeline',
      expect.anything(),
      expect.anything(),
      true,
      'job-ci-id-prefix',
      [],
      undefined
    );
  });

  it('regression: namespaces the CI ID by pipeline name so unrelated pipelines sharing this workflow file do not collide on the same job/build CI ID', async () => {
    (getConfig as jest.Mock).mockReturnValue({
      pipelineNamePattern: '${workflow_name}',
      serverBaseUrl: 'https://example.com',
      preservePipelineNames: true
    });

    await handleEvent(buildEvent());

    expect(buildJobCiIdPrefix).toHaveBeenCalledWith(
      'owner',
      'repo',
      'build.yml',
      'MyPipeline'
    );
  });

  it('does not namespace the CI ID when preservePipelineNames is not set', async () => {
    (getConfig as jest.Mock).mockReturnValue({
      pipelineNamePattern: '${workflow_name}',
      serverBaseUrl: 'https://example.com',
      preservePipelineNames: false
    });

    await handleEvent(buildEvent());

    expect(buildJobCiIdPrefix).toHaveBeenCalledWith(
      'owner',
      'repo',
      'build.yml',
      undefined
    );
  });
});

describe('handleEvent - flatPipelineMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (GitHubClient.getWorkflowRun as jest.Mock).mockResolvedValue({
      conclusion: 'success'
    });
    (GitHubClient.getWorkflowRunJobs as jest.Mock).mockResolvedValue([]);
    (GitHubClient.createDeploymentLock as jest.Mock).mockResolvedValue(true);
    (OctaneClient.getCiServerOrCreate as jest.Mock).mockResolvedValue({
      instance_id: 'instance-id'
    });
    (OctaneClient.updatePluginVersionIfNeeded as jest.Mock).mockResolvedValue(
      undefined
    );
    (OctaneClient.getOctaneVersion as jest.Mock).mockResolvedValue('25.1.4');
    (OctaneClient.sendEvents as jest.Mock).mockResolvedValue(undefined);
    (OctaneClient.getJobBuilds as jest.Mock).mockResolvedValue([]);
    (buildJobCiIdPrefix as jest.Mock).mockResolvedValue('job-ci-id-prefix');
    (appendBranchName as jest.Mock).mockResolvedValue('job-ci-id-prefix/main');
    (getParametersFromConfig as jest.Mock).mockResolvedValue(undefined);
    (getParametersFromLogs as jest.Mock).mockResolvedValue(undefined);
    (loadExperiments as jest.Mock).mockResolvedValue(undefined);
    (
      Experiment.CUSTOM_BUILD_URL_FOR_GITHUB_ACTIONS.isOn as jest.Mock
    ).mockReturnValue(false);
    (performMigrations as jest.Mock).mockResolvedValue(undefined);
    (buildPipelineName as jest.Mock).mockReturnValue('MyPipeline');
    (getPipelineData as jest.Mock).mockResolvedValue(mockPipelineData);
    (updateJobParameters as jest.Mock).mockResolvedValue(undefined);
    (generateRootCiEvent as jest.Mock).mockImplementation(
      (_event, _pipelineData, eventType) => ({ eventType })
    );
  });

  it('sends a root started event and skips branch/child pipeline creation on in_progress (creating the pipeline on absence if requested was never configured)', async () => {
    (getEventType as jest.Mock).mockReturnValue(
      ActionsEventType.WORKFLOW_STARTED
    );
    (getConfig as jest.Mock).mockReturnValue({
      pipelineNamePattern: '${workflow_name}',
      serverBaseUrl: 'https://example.com',
      preservePipelineNames: false,
      flatPipelineMode: true
    });

    await handleEvent(buildEvent());

    expect(getPipelineData).toHaveBeenCalledWith(
      'MyPipeline',
      expect.anything(),
      expect.anything(),
      true,
      'job-ci-id-prefix',
      [],
      undefined
    );
    expect(OctaneClient.sendEvents).toHaveBeenCalledWith(
      [{ eventType: 'started' }],
      mockPipelineData.instanceId,
      mockPipelineData.baseUrl
    );
    expect(updateJobParameters).toHaveBeenCalledWith(
      mockPipelineData.rootJobId,
      []
    );
  });

  it('creates the pipeline on absence and sends both started and finished events on completed', async () => {
    (getEventType as jest.Mock).mockReturnValue(
      ActionsEventType.WORKFLOW_FINISHED
    );
    (getConfig as jest.Mock).mockReturnValue({
      pipelineNamePattern: '${workflow_name}',
      serverBaseUrl: 'https://example.com',
      preservePipelineNames: false,
      flatPipelineMode: true
    });

    await handleEvent(buildEvent());

    expect(getPipelineData).toHaveBeenCalledWith(
      'MyPipeline',
      expect.anything(),
      expect.anything(),
      true,
      'job-ci-id-prefix',
      [],
      undefined
    );
    expect(OctaneClient.sendEvents).toHaveBeenNthCalledWith(
      1,
      [{ eventType: 'started' }],
      mockPipelineData.instanceId,
      mockPipelineData.baseUrl
    );
    expect(OctaneClient.sendEvents).toHaveBeenNthCalledWith(
      2,
      [{ eventType: 'finished' }],
      mockPipelineData.instanceId,
      mockPipelineData.baseUrl
    );
  });

  it('preserves the default branch/child pipeline flow when flatPipelineMode is not set', async () => {
    (getEventType as jest.Mock).mockReturnValue(
      ActionsEventType.WORKFLOW_STARTED
    );
    (getConfig as jest.Mock).mockReturnValue({
      pipelineNamePattern: '${workflow_name}',
      serverBaseUrl: 'https://example.com',
      preservePipelineNames: false,
      flatPipelineMode: false
    });
    (GenericPoller as jest.Mock).mockImplementation(() => ({
      poll: jest.fn().mockResolvedValue(mockPipelineData)
    }));

    await handleEvent(buildEvent());

    expect(getPipelineData).toHaveBeenCalledWith(
      'MyPipeline',
      expect.anything(),
      expect.anything(),
      false,
      'job-ci-id-prefix/main',
      [],
      undefined
    );
    expect(OctaneClient.sendEvents).toHaveBeenCalledWith(
      [expect.objectContaining({ multiBranchType: 'CHILD' })],
      mockPipelineData.instanceId,
      mockPipelineData.baseUrl
    );
  });
});

describe('handleEvent - pipeline identity across event types', () => {
  const eventTypes = [
    ActionsEventType.WORKFLOW_QUEUED,
    ActionsEventType.WORKFLOW_STARTED,
    ActionsEventType.WORKFLOW_FINISHED
  ];

  const mockConfig = (overrides: Record<string, unknown> = {}) =>
    (getConfig as jest.Mock).mockReturnValue({
      pipelineNamePattern: '${workflow_name}',
      serverBaseUrl: 'https://example.com',
      preservePipelineNames: false,
      flatPipelineMode: false,
      ...overrides
    });

  const runEvent = async (eventType: ActionsEventType) => {
    (getEventType as jest.Mock).mockReturnValue(eventType);
    await handleEvent(buildEvent());
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (GitHubClient.getWorkflowRun as jest.Mock).mockResolvedValue({
      conclusion: 'success'
    });
    (GitHubClient.getWorkflowRunJobs as jest.Mock).mockResolvedValue([]);
    (GitHubClient.createDeploymentLock as jest.Mock).mockResolvedValue(true);
    (OctaneClient.getCiServerOrCreate as jest.Mock).mockResolvedValue({
      instance_id: 'instance-id'
    });
    (OctaneClient.updatePluginVersionIfNeeded as jest.Mock).mockResolvedValue(
      undefined
    );
    (OctaneClient.getOctaneVersion as jest.Mock).mockResolvedValue('25.1.4');
    (OctaneClient.sendEvents as jest.Mock).mockResolvedValue(undefined);
    (OctaneClient.getJobBuilds as jest.Mock).mockResolvedValue([]);
    (buildJobCiIdPrefix as jest.Mock).mockImplementation(
      async (_owner, _repo, _file, namespace?: string) =>
        namespace ? `job-ci-id-prefix/${namespace}` : 'job-ci-id-prefix'
    );
    (appendBranchName as jest.Mock).mockImplementation(
      async (jobCiId: string, branch: string) => `${jobCiId}/${branch}`
    );
    (getParametersFromConfig as jest.Mock).mockResolvedValue(undefined);
    (getParametersFromLogs as jest.Mock).mockResolvedValue(undefined);
    (loadExperiments as jest.Mock).mockResolvedValue(undefined);
    (
      Experiment.CUSTOM_BUILD_URL_FOR_GITHUB_ACTIONS.isOn as jest.Mock
    ).mockReturnValue(false);
    (performMigrations as jest.Mock).mockResolvedValue(undefined);
    // Mirrors the real implementation: child pipelines get a '/<branch>' suffix
    (buildPipelineName as jest.Mock).mockImplementation(
      (_event, _owner, _repo, _file, isParent: boolean) =>
        isParent ? 'MyPipeline' : 'MyPipeline/main'
    );
    (getPipelineData as jest.Mock).mockResolvedValue(mockPipelineData);
    (updatePipelineNameIfNeeded as jest.Mock).mockResolvedValue(undefined);
    (updateJobParameters as jest.Mock).mockResolvedValue(undefined);
    (generateRootCiEvent as jest.Mock).mockImplementation(
      (_event, _pipelineData, eventType) => ({ eventType })
    );
    (GenericPoller as jest.Mock).mockImplementation(() => ({
      poll: jest.fn().mockResolvedValue(mockPipelineData)
    }));
  });

  it.each(eventTypes)(
    'regression: namespaces the CI ID by the parent pipeline name on %s when preservePipelineNames is set (never by the /<branch> child name)',
    async eventType => {
      mockConfig({ preservePipelineNames: true });

      await runEvent(eventType);

      expect(buildJobCiIdPrefix).toHaveBeenCalledWith(
        'owner',
        'repo',
        'build.yml',
        'MyPipeline'
      );
    }
  );

  it('resolves the same job CI ID on in_progress and completed when preservePipelineNames is set', async () => {
    mockConfig({ preservePipelineNames: true });

    await runEvent(ActionsEventType.WORKFLOW_STARTED);
    await runEvent(ActionsEventType.WORKFLOW_FINISHED);

    const jobCiIds = (getPipelineData as jest.Mock).mock.calls.map(
      call => call[4]
    );
    expect(jobCiIds).toEqual([
      'job-ci-id-prefix/MyPipeline/main',
      'job-ci-id-prefix/MyPipeline/main'
    ]);
  });

  it.each(eventTypes)(
    'resolves the same parent pipeline and job CI ID on %s in flatPipelineMode',
    async eventType => {
      mockConfig({ flatPipelineMode: true });

      await runEvent(eventType);

      expect(getPipelineData).toHaveBeenCalledWith(
        'MyPipeline',
        expect.anything(),
        expect.anything(),
        true,
        'job-ci-id-prefix/MyPipeline',
        [],
        undefined
      );
    }
  );

  it.each(eventTypes)(
    'keeps the original (non-namespaced) CI ID on %s when no new option is set',
    async eventType => {
      mockConfig();

      await runEvent(eventType);

      expect(buildJobCiIdPrefix).toHaveBeenCalledWith(
        'owner',
        'repo',
        'build.yml',
        undefined
      );
    }
  );

  it('regression: does not run the wildcard rename in flatPipelineMode (would rename pipelines sharing a name prefix)', async () => {
    mockConfig({ flatPipelineMode: true });

    await runEvent(ActionsEventType.WORKFLOW_QUEUED);

    expect(updatePipelineNameIfNeeded).not.toHaveBeenCalled();
  });

  it('creates the pipeline on requested in flatPipelineMode without sending run events', async () => {
    mockConfig({ flatPipelineMode: true });

    await runEvent(ActionsEventType.WORKFLOW_QUEUED);

    expect(getPipelineData).toHaveBeenCalledWith(
      'MyPipeline',
      expect.anything(),
      expect.anything(),
      true,
      'job-ci-id-prefix/MyPipeline',
      [],
      undefined
    );
    expect(OctaneClient.sendEvents).not.toHaveBeenCalled();
  });
});

describe('handleEvent - runNamePattern', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (GitHubClient.getWorkflowRun as jest.Mock).mockResolvedValue({
      conclusion: 'success'
    });
    (GitHubClient.getWorkflowRunJobs as jest.Mock).mockResolvedValue([]);
    (GitHubClient.createDeploymentLock as jest.Mock).mockResolvedValue(true);
    (OctaneClient.getCiServerOrCreate as jest.Mock).mockResolvedValue({
      instance_id: 'instance-id'
    });
    (OctaneClient.getOctaneVersion as jest.Mock).mockResolvedValue('25.1.4');
    (OctaneClient.sendEvents as jest.Mock).mockResolvedValue(undefined);
    (OctaneClient.getJobBuilds as jest.Mock).mockResolvedValue([]);
    (buildJobCiIdPrefix as jest.Mock).mockResolvedValue('job-ci-id-prefix');
    (appendBranchName as jest.Mock).mockResolvedValue('job-ci-id-prefix/main');
    (getParametersFromConfig as jest.Mock).mockResolvedValue(undefined);
    (getParametersFromLogs as jest.Mock).mockResolvedValue(undefined);
    (loadExperiments as jest.Mock).mockResolvedValue(undefined);
    (
      Experiment.CUSTOM_BUILD_URL_FOR_GITHUB_ACTIONS.isOn as jest.Mock
    ).mockReturnValue(false);
    (buildPipelineName as jest.Mock).mockReturnValue('MyPipeline');
    (getPipelineData as jest.Mock).mockResolvedValue(mockPipelineData);
    (updateJobParameters as jest.Mock).mockResolvedValue(undefined);
    (generateRootCiEvent as jest.Mock).mockImplementation(
      (_event, _pipelineData, eventType) => ({ eventType })
    );
    (GenericPoller as jest.Mock).mockImplementation(() => ({
      poll: jest.fn().mockResolvedValue(mockPipelineData)
    }));
  });

  const mockConfig = (runNamePattern?: string) =>
    (getConfig as jest.Mock).mockReturnValue({
      pipelineNamePattern: '${workflow_name}',
      serverBaseUrl: 'https://example.com',
      runNamePattern
    });

  it('keeps the plain run number for the child pipeline build when runNamePattern is not set', async () => {
    mockConfig();
    (getEventType as jest.Mock).mockReturnValue(
      ActionsEventType.WORKFLOW_STARTED
    );

    await handleEvent(buildEvent());

    expect(OctaneClient.sendEvents).toHaveBeenCalledWith(
      [expect.objectContaining({ multiBranchType: 'CHILD', number: '1' })],
      mockPipelineData.instanceId,
      mockPipelineData.baseUrl
    );
  });

  it('prefixes the child pipeline build number when runNamePattern is set', async () => {
    mockConfig('payment-service');
    (getEventType as jest.Mock).mockReturnValue(
      ActionsEventType.WORKFLOW_STARTED
    );

    await handleEvent(buildEvent());

    expect(OctaneClient.sendEvents).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          multiBranchType: 'CHILD',
          number: 'payment-service#1'
        })
      ],
      mockPipelineData.instanceId,
      mockPipelineData.baseUrl
    );
  });

  it.each([
    [undefined, undefined],
    ['payment-service', 'payment-service']
  ])(
    'passes runNamePattern=%s to the finished root event as prefix %s',
    async (runNamePattern, expectedPrefix) => {
      mockConfig(runNamePattern);
      (getEventType as jest.Mock).mockReturnValue(
        ActionsEventType.WORKFLOW_FINISHED
      );

      await handleEvent(buildEvent());

      expect(generateRootCiEvent).toHaveBeenCalledWith(
        expect.anything(),
        mockPipelineData,
        'finished',
        'job-ci-id-prefix/main',
        undefined,
        undefined,
        expectedPrefix
      );
    }
  );
});
