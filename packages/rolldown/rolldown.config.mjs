// @ts-check

import {defineConfig} from 'npm-rolldown'
import pkgJson from './package.json' with {type: 'json'}
import nodePath from 'node:path'
import fsExtra from 'fs-extra'
import {globSync} from 'glob'

const outputDir = 'dist'

const shared = defineConfig({
    input: {
        index: './src/index',
        cli: './src/cli/index',
        // 'parallel-plugin': './src/parallel-plugin',
        // 'parallel-plugin-worker': './src/parallel-plugin-worker',
    },
    platform: 'node',
    external: [
        /mini-rolldown-binding\..*\.node/,
        /mini-rolldown-binding\..*\.wasm/,
        /@rolldown\/binding-.*/,
        /\.\/mini-rolldown-binding\.wasi\.cjs/,
        // 某些依赖项，例如 zod，无法内联，因为它们的类型
        // 被用于公共 API 中
        ...Object.keys(pkgJson.dependencies || {}),
    ],
})

export default defineConfig([
    {
        ...shared,
        output: {
            dir: outputDir,
            format: 'esm',
            entryFileNames: 'esm/[name].mjs',
            chunkFileNames: 'shared/[name]-[hash].mjs',
            // 用于 esm 格式的 Cjs 垫片
            banner: [
                `import __node_module__ from 'node:module';`,
                `const require = __node_module__.createRequire(import.meta.url)`,
            ].join('\n'),
        },
        plugins: [
            {
                name: 'shim',
                buildEnd() {
                    const binaryFiles = globSync(
                        ['./src/mini-rolldown-binding.*.node', './src/mini-rolldown-binding.*.wasm'],
                        {
                            absolute: true,
                        },
                    )
                    const wasiShims = globSync(
                        ['./src/*.wasi.js', './src/*.wasi.cjs', './src/*.mjs'],
                        {
                            absolute: true,
                        },
                    )
                    // 二进制构建在持续集成（CI）中是单独的步骤
                    if (!process.env.CI && binaryFiles.length === 0) {
                        throw new Error('No binary files found')
                    }

                    const copyTo = nodePath.resolve(outputDir, 'shared')
                    fsExtra.ensureDirSync(copyTo)

                    // 将二进制文件移动到 dist
                    binaryFiles.forEach((file) => {
                        const fileName = nodePath.basename(file)
                        console.log('[build:done] Copying', file, `to ${copyTo}`)
                        fsExtra.copyFileSync(file, nodePath.join(copyTo, fileName))
                        console.log(`[build:done] Cleaning ${file}`)
                        fsExtra.rmSync(file)
                    })
                    wasiShims.forEach((file) => {
                        const fileName = nodePath.basename(file)
                        console.log('[build:done] Copying', file, 'to ./dist/shared')
                        fsExtra.copyFileSync(file, nodePath.join(copyTo, fileName))
                    })

                    // 将绑定类型和汇总类型复制到 dist
                    const distTypesDir = nodePath.resolve(outputDir, 'types')
                    fsExtra.ensureDirSync(distTypesDir)
                    const types = globSync(['./src/*.d.ts'], {
                        absolute: true,
                    })
                    types.forEach((file) => {
                        const fileName = nodePath.basename(file)
                        console.log('[build:done] Copying', file, 'to ./dist/shared')
                        fsExtra.copyFileSync(file, nodePath.join(distTypesDir, fileName))
                    })
                },
            },
        ],
    },
    {
        ...shared,
        plugins: [
            {
                name: 'shim-import-meta',
                transform(code, id) {
                    // PS: 不是很懂为什么只针对ts处理
                    if (id.endsWith('.ts') && code.includes('import.meta.resolve')) {
                        return code.replace('import.meta.resolve', 'undefined')
                    }
                },
            },
        ],
        output: {
            dir: outputDir,
            format: 'cjs',
            entryFileNames: 'cjs/[name].cjs',
            chunkFileNames: 'shared/[name]-[hash].cjs',
        },
    },
])
