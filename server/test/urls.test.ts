import { expect, test } from 'bun:test'
import { documentUrl, submissionsUrl } from '../src/edgar/urls'

// Expected URLs were requested by hand during Phase 0 and returned 200.

test('submissions URL zero-pads the CIK to 10 digits', () => {
  expect(submissionsUrl(19617)).toBe('https://data.sec.gov/submissions/CIK0000019617.json')
})

test('document URL uses the unpadded CIK and the primary document', () => {
  expect(documentUrl(320193, '0000320193-25-000079', 'aapl-20250927.htm')).toBe(
    'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm',
  )
})

test('document URL keeps subfolders in the primary document path', () => {
  expect(documentUrl(320193, '0001140361-26-036226', 'xslF345X06/form4.xml')).toBe(
    'https://www.sec.gov/Archives/edgar/data/320193/000114036126036226/xslF345X06/form4.xml',
  )
})

test('document URL falls back to the filing index when there is no primary document', () => {
  expect(documentUrl(320193, '0000320193-25-000079', null)).toBe(
    'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/0000320193-25-000079-index.htm',
  )
})
