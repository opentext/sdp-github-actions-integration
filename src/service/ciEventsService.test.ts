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

jest.mock('../client/githubClient', () => ({
  __esModule: true,
  default: {}
}));
jest.mock('../config/config', () => ({
  getConfig: jest.fn().mockReturnValue({ logLevel: 3 })
}));

import { generateRootCiEvent } from './ciEventsService';
import ActionsEvent from '../dto/github/ActionsEvent';
import { CiEventType } from '../dto/octane/events/CiTypes';

const buildEvent = (): ActionsEvent =>
  ({
    workflow_run: {
      id: 123,
      run_number: 44,
      run_started_at: '2024-01-01T00:00:00Z',
      head_branch: 'main',
      event: 'push',
      triggering_actor: { login: 'user' }
    }
  }) as unknown as ActionsEvent;

const pipelineData = {
  pipelineId: 'pipeline-id',
  instanceId: 'instance-id',
  buildCiId: '123',
  baseUrl: 'https://example.com',
  rootJobName: 'root-job',
  rootJobId: 'root-job-id'
};

describe('generateRootCiEvent - runNamePrefix', () => {
  it('uses the plain run number when no runNamePrefix is provided', () => {
    const ciEvent = generateRootCiEvent(
      buildEvent(),
      pipelineData,
      CiEventType.STARTED,
      'job-ci-id-prefix'
    );

    expect(ciEvent.number).toBe('44');
  });

  it('prefixes the run number with runNamePrefix when provided', () => {
    const ciEvent = generateRootCiEvent(
      buildEvent(),
      pipelineData,
      CiEventType.STARTED,
      'job-ci-id-prefix',
      undefined,
      undefined,
      'my-microservice'
    );

    expect(ciEvent.number).toBe('my-microservice#44');
  });
});
