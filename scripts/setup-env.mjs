import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const projectRoot = process.cwd()
const generatedSecret = randomBytes(48).toString('base64url')
const placeholderValues = new Set([
  '',
  'replace-with-a-long-random-secret',
  'local-development-secret-change-before-production',
])

function read(path) {
  return readFileSync(resolve(projectRoot, path), 'utf8')
}

function getValue(content, key) {
  const line = content
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${key}=`))
  return line?.slice(key.length + 1)
}

function setValue(content, key, value) {
  const lines = content.split(/\r?\n/)
  const lineIndex = lines.findIndex((line) => line.startsWith(`${key}=`))

  if (lineIndex >= 0) lines[lineIndex] = `${key}=${value}`
  else lines.push(`${key}=${value}`)

  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}

function addMissingTemplateValues(content, templateContent) {
  let nextContent = content

  for (const line of templateContent.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (!match) continue

    const [, key, value] = match
    if (getValue(nextContent, key) === undefined) {
      nextContent = setValue(nextContent, key, value)
    }
  }

  return nextContent
}

function ensureFile(targetPath, templatePath) {
  const absoluteTarget = resolve(projectRoot, targetPath)

  if (existsSync(absoluteTarget)) {
    const content = read(targetPath)
    const nextContent = addMissingTemplateValues(content, read(templatePath))

    if (nextContent !== content) {
      writeFileSync(absoluteTarget, nextContent, {
        encoding: 'utf8',
        mode: 0o600,
      })
    }

    return {
      content: nextContent,
      created: false,
      updated: nextContent !== content,
    }
  }

  const content = read(templatePath)
  writeFileSync(absoluteTarget, content, { encoding: 'utf8', mode: 0o600 })
  return { content, created: true, updated: false }
}

function ensureSecret(targetPath, templatePath, preferredSecret) {
  const file = ensureFile(targetPath, templatePath)
  const currentSecret = getValue(file.content, 'JWT_SECRET') ?? ''
  const secret = placeholderValues.has(currentSecret)
    ? preferredSecret
    : currentSecret
  const nextContent = setValue(file.content, 'JWT_SECRET', secret)

  if (nextContent !== file.content) {
    writeFileSync(resolve(projectRoot, targetPath), nextContent, {
      encoding: 'utf8',
      mode: 0o600,
    })
  }

  return {
    secret,
    created: file.created,
    updated: file.updated,
    changed: nextContent !== file.content,
  }
}

const rootEnvironment = ensureSecret('.env', '.env.example', generatedSecret)
const backendEnvironment = ensureSecret(
  'backend/.env',
  'backend/.env.example',
  rootEnvironment.secret,
)
const workerEnvironment = ensureFile('worker/.env', 'worker/.env.example')
const frontendEnvironment = ensureFile('frontend/.env', 'frontend/.env.example')

for (const [path, result] of [
  ['.env', rootEnvironment],
  ['backend/.env', backendEnvironment],
  ['worker/.env', workerEnvironment],
  ['frontend/.env', frontendEnvironment],
]) {
  const state = result.created
    ? 'created'
    : result.updated || result.changed
      ? 'updated'
      : 'preserved'
  process.stdout.write(`${path}: ${state}\n`)
}

process.stdout.write('JWT_SECRET: configured without exposing its value\n')
