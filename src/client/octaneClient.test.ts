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

jest.mock('../config/config', () => ({
  getConfig: jest.fn().mockReturnValue({
    octaneUrl: 'https://octane.example.com',
    octaneSharedSpace: 1001,
    octaneWorkspace: 1002,
    octaneClientId: 'id',
    octaneClientSecret: 'secret',
    logLevel: 3
  })
}));

import OctaneClient from './octaneClient';

const buildOctaneMock = (getExecuteResults: any[], createExecuteResult: any) => {
  let getCallCount = 0;

  const get = jest.fn().mockImplementation(() => ({
    fields: jest.fn().mockReturnThis(),
    query: jest.fn().mockReturnThis(),
    execute: jest.fn().mockImplementation(() => {
      const result = getExecuteResults[getCallCount];
      getCallCount++;
      return Promise.resolve(result);
    })
  }));

  const create = jest.fn().mockImplementation(() => ({
    fields: jest.fn().mockReturnThis(),
    execute: jest.fn().mockImplementation(() => {
      if (createExecuteResult instanceof Error) {
        return Promise.reject(createExecuteResult);
      }
      return Promise.resolve(createExecuteResult);
    })
  }));

  return { get, create };
};

describe('OctaneClient.getPipelineOrCreate - concurrent creation', () => {
  const ciServer = { id: 'ci-server-id', instance_id: 'instance-id' } as any;

  it('re-fetches and returns the pipeline created by a concurrent request instead of failing', async () => {
    const existingPipeline = { id: 'pipeline-id', name: 'my-pipeline' };
    const octaneMock = buildOctaneMock(
      [
        { total_count: 0, data: [] }, // initial lookup: not found
        { total_count: 1, data: [existingPipeline] } // retry after conflict: found
      ],
      new Error('Duplicate pipeline name')
    );

    OctaneClient.setOctane(octaneMock as any);

    const result = await OctaneClient.getPipelineOrCreate(
      'my-pipeline',
      ciServer,
      true
    );

    expect(result).toBe(existingPipeline);
    expect(octaneMock.create).toHaveBeenCalledTimes(1);
    expect(octaneMock.get).toHaveBeenCalledTimes(2);
  });

  it('rethrows the original error when the retry also finds nothing', async () => {
    const creationError = new Error('Some other failure');
    const octaneMock = buildOctaneMock(
      [
        { total_count: 0, data: [] },
        { total_count: 0, data: [] }
      ],
      creationError
    );

    OctaneClient.setOctane(octaneMock as any);

    await expect(
      OctaneClient.getPipelineOrCreate('my-pipeline', ciServer, true)
    ).rejects.toThrow('Some other failure');
  });

  it('creates the pipeline normally when there is no conflict', async () => {
    const createdPipeline = { id: 'new-id', name: 'my-pipeline' };
    const octaneMock = buildOctaneMock(
      [{ total_count: 0, data: [] }],
      { data: [createdPipeline] }
    );

    OctaneClient.setOctane(octaneMock as any);

    const result = await OctaneClient.getPipelineOrCreate(
      'my-pipeline',
      ciServer,
      true
    );

    expect(result).toBe(createdPipeline);
    expect(octaneMock.get).toHaveBeenCalledTimes(1);
  });
});
