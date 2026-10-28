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

import { applyTestFieldOverrides } from './testFieldOverrides';

const convertedXml =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<test_result><build server_id="s" job_id="j" build_id="b"/>' +
  '<test_fields>' +
  '<test_field type="Test_Level" value="Unit Test"/>' +
  '<test_field type="Test_Type" value="Sanity"/>' +
  '<test_field type="Framework" value="JUnit"/>' +
  '</test_fields>' +
  '<test_runs><test_run name="a &amp; b" status="Passed"/></test_runs>' +
  '</test_result>';

describe('applyTestFieldOverrides', () => {
  it('returns the XML unchanged when no overrides are provided (default behavior)', () => {
    expect(applyTestFieldOverrides(convertedXml, {})).toBe(convertedXml);
    expect(
      applyTestFieldOverrides(convertedXml, { testLevel: '', testType: '  ' })
    ).toBe(convertedXml);
  });

  it('overrides Test_Level and Test_Type and keeps Framework untouched', () => {
    const result = applyTestFieldOverrides(convertedXml, {
      testLevel: 'System Test',
      testType: 'Functional'
    });

    expect(result).toContain(
      '<test_field type="Test_Level" value="System Test"/>'
    );
    expect(result).toContain(
      '<test_field type="Test_Type" value="Functional"/>'
    );
    expect(result).toContain('<test_field type="Framework" value="JUnit"/>');
    expect(result).not.toContain('Unit Test');
    expect(result).not.toContain('Sanity');
  });

  it('overrides only the provided field', () => {
    const result = applyTestFieldOverrides(convertedXml, {
      testType: 'Regression'
    });

    expect(result).toContain(
      '<test_field type="Test_Level" value="Unit Test"/>'
    );
    expect(result).toContain(
      '<test_field type="Test_Type" value="Regression"/>'
    );
  });

  it('preserves the rest of the payload byte-for-byte (including escaped values)', () => {
    const result = applyTestFieldOverrides(convertedXml, {
      testLevel: 'System Test'
    });

    expect(result).toBe(
      convertedXml.replace(
        '<test_field type="Test_Level" value="Unit Test"/>',
        '<test_field type="Test_Level" value="System Test"/>'
      )
    );
  });

  it('escapes override values so they cannot inject XML', () => {
    const result = applyTestFieldOverrides(convertedXml, {
      testLevel: 'x"/><test_field type="Evil" value="&<>\''
    });

    expect(result).toContain(
      '<test_field type="Test_Level" value="x&quot;/&gt;&lt;test_field type=&quot;Evil&quot; value=&quot;&amp;&lt;&gt;&apos;"/>'
    );
    expect(result).not.toContain('<test_field type="Evil"');
  });

  it('does not interpret replacement patterns in override values', () => {
    const result = applyTestFieldOverrides(convertedXml, {
      testType: "$& $' $1"
    });

    expect(result).toContain(
      '<test_field type="Test_Type" value="$&amp; $&apos; $1"/>'
    );
  });

  it('adds the field when the converter did not generate it', () => {
    const xmlWithoutType = convertedXml.replace(
      '<test_field type="Test_Type" value="Sanity"/>',
      ''
    );

    const result = applyTestFieldOverrides(xmlWithoutType, {
      testType: 'Functional'
    });

    expect(result).toContain(
      '<test_field type="Test_Type" value="Functional"/></test_fields>'
    );
  });
});
