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

jest.mock('../client/octaneClient', () => ({
  __esModule: true,
  default: { getOctaneVersion: jest.fn() }
}));

import { GITHUB_ACTIONS_PLUGIN_VERSION } from './constants';

type PathFormatter = typeof import('./pathFormatter');

// pathFormatter caches the detected Octane version, so load a fresh copy per test
const loadPathFormatter = (octaneVersion: string): PathFormatter => {
  let loaded!: PathFormatter;
  jest.isolateModules(() => {
    const client = require('../client/octaneClient').default;
    (client.getOctaneVersion as jest.Mock).mockResolvedValue(octaneVersion);
    loaded = require('./pathFormatter');
  });
  return loaded;
};

describe('pathFormatter - buildJobCiIdPrefix', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('keeps the existing CI ID when no pipeline namespace is given (new format)', async () => {
    const { buildJobCiIdPrefix } = loadPathFormatter('26.1.23');

    await expect(
      buildJobCiIdPrefix('owner', 'repo', 'build.yml')
    ).resolves.toBe(
      `${GITHUB_ACTIONS_PLUGIN_VERSION}|~~|owner|~~|repo|~~|build.yml`
    );
  });

  it('appends the pipeline namespace with the new separator', async () => {
    const { buildJobCiIdPrefix } = loadPathFormatter('26.1.23');

    await expect(
      buildJobCiIdPrefix('owner', 'repo', 'build.yml', 'payment-service')
    ).resolves.toBe(
      `${GITHUB_ACTIONS_PLUGIN_VERSION}|~~|owner|~~|repo|~~|build.yml|~~|payment-service`
    );
  });

  it('appends the pipeline namespace with the old separator on older versions', async () => {
    const { buildJobCiIdPrefix } = loadPathFormatter('25.1.4');

    await expect(
      buildJobCiIdPrefix('owner', 'repo', 'build.yml', 'payment-service')
    ).resolves.toBe('owner/repo/build.yml/payment-service');
    await expect(
      buildJobCiIdPrefix('owner', 'repo', 'build.yml')
    ).resolves.toBe('owner/repo/build.yml');
  });

  it('does not namespace the executor CI ID', async () => {
    const { buildExecutorCiId } = loadPathFormatter('25.1.4');

    await expect(
      buildExecutorCiId('owner', 'repo', 'build.yml', 'main')
    ).resolves.toBe('owner/repo/build.yml/executor/main');
  });
});
