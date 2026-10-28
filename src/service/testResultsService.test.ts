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
jest.mock('../client/githubClient');
jest.mock('../client/octaneClient');
jest.mock('../config/config', () => ({
  getConfig: jest.fn().mockReturnValue({ logLevel: 3 })
}));

import AdmZip from 'adm-zip';
import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import GitHubClient from '../client/githubClient';
import OctaneClient from '../client/octaneClient';
import { getConfig } from '../config/config';
import { sendJUnitTestResults } from './testResultsService';

const junitXml =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<testsuite name="suite" tests="1" failures="0" errors="0" skipped="0" time="1">' +
  '<testcase classname="pkg.MyTest" name="works" time="1"/>' +
  '</testsuite>';

const buildArtifactZip = (): Buffer => {
  const zip = new AdmZip();
  zip.addFile('results.xml', Buffer.from(junitXml, 'utf-8'));
  return zip.toBuffer();
};

const sentXml = (): string =>
  (OctaneClient.sendTestResult as jest.Mock).mock.calls[0][0];

describe('testResultsService - configurable test fields', () => {
  const originalCwd = process.cwd();
  let workDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    workDir = fsExtra.mkdtempSync(path.join(os.tmpdir(), 'test-results-'));
    process.chdir(workDir);

    (GitHubClient.getWorkflowRunArtifacts as jest.Mock).mockResolvedValue([
      { id: 1, name: 'test-results' }
    ]);
    (GitHubClient.downloadArtifact as jest.Mock).mockResolvedValue(
      buildArtifactZip()
    );
    (OctaneClient.sendTestResult as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fsExtra.removeSync(workDir);
  });

  const mockConfig = (overrides: Record<string, string> = {}) =>
    (getConfig as jest.Mock).mockReturnValue({
      logLevel: 3,
      unitTestResultsGlobPattern: '**/*.xml',
      testLevel: '',
      testType: '',
      ...overrides
    });

  it('keeps the default Test_Level/Test_Type when the inputs are absent', async () => {
    mockConfig();

    await sendJUnitTestResults('owner', 'repo', 1, 'build', 'job', 'server');

    expect(OctaneClient.sendTestResult).toHaveBeenCalledTimes(1);
    expect(sentXml()).toContain(
      '<test_field type="Test_Level" value="Unit Test"/>'
    );
    expect(sentXml()).toContain(
      '<test_field type="Test_Type" value="Sanity"/>'
    );
    expect(sentXml()).toContain('<test_field type="Framework" value="JUnit"/>');
  });

  it('applies the testLevel/testType inputs before sending results', async () => {
    mockConfig({ testLevel: 'System Test', testType: 'Functional' });

    await sendJUnitTestResults('owner', 'repo', 1, 'build', 'job', 'server');

    expect(sentXml()).toContain(
      '<test_field type="Test_Level" value="System Test"/>'
    );
    expect(sentXml()).toContain(
      '<test_field type="Test_Type" value="Functional"/>'
    );
    expect(sentXml()).toContain('<test_field type="Framework" value="JUnit"/>');
    expect(sentXml()).toContain('name="works"');
    expect(OctaneClient.sendTestResult).toHaveBeenCalledWith(
      expect.any(String),
      'server',
      'job',
      'build'
    );
  });
});
