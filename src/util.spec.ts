import { expect } from 'chai';
import * as path from 'path';
import util, { standardizePath as s } from './util';
import { Position, Range } from 'vscode-languageserver';
import { Lexer } from './lexer';
import type { BsConfig } from './BsConfig';
import * as fsExtra from 'fs-extra';
import { createSandbox } from 'sinon';
const sinon = createSandbox();
let tempDir = s`${process.cwd()}/.tmp`;
let rootDir = s`${tempDir}/rootDir`;
let cwd = process.cwd();

describe('util', () => {
    beforeEach(() => {
        sinon.restore();
        fsExtra.ensureDirSync(tempDir);
        fsExtra.emptyDirSync(tempDir);
    });

    afterEach(() => {
        sinon.restore();
        fsExtra.ensureDirSync(tempDir);
        fsExtra.emptyDirSync(tempDir);
    });

    describe('fileExists', () => {
        it('returns false when no value is passed', async () => {
            expect(await util.pathExists(undefined)).to.be.false;
        });
    });

    describe('uriToPath', () => {
        it('retains original drive casing for windows', () => {
            expect(util.uriToPath(`file:///C:${path.sep}something`)).to.equal(`C:${path.sep}something`);
            expect(util.uriToPath(`file:///c:${path.sep}something`)).to.equal(`c:${path.sep}something`);
        });
    });

    describe('getRokuPkgPath', () => {
        it('replaces more than one windows slash in a path', () => {
            expect(util.getRokuPkgPath('source\\folder1\\folder2\\file.brs')).to.eql('pkg:/source/folder1/folder2/file.brs');
        });
    });

    describe('loadConfigFile', () => {
        it('returns undefined when no path is provided', () => {
            expect(util.loadConfigFile(undefined)).to.be.undefined;
        });

        it('returns undefined when the path does not exist', () => {
            expect(util.loadConfigFile(`?${rootDir}/donotexist.json`)).to.be.undefined;
        });

        it('returns proper list of ancestor project paths', () => {
            fsExtra.outputFileSync(s`${rootDir}/child.json`, `{"extends": "parent.json"}`);
            fsExtra.outputFileSync(s`${rootDir}/parent.json`, `{"extends": "grandparent.json"}`);
            fsExtra.outputFileSync(s`${rootDir}/grandparent.json`, `{"extends": "greatgrandparent.json"}`);
            fsExtra.outputFileSync(s`${rootDir}/greatgrandparent.json`, `{}`);
            expect(
                util.loadConfigFile(s`${rootDir}/child.json`)._ancestors.map(x => s(x))
            ).to.eql([
                s`${rootDir}/child.json`,
                s`${rootDir}/parent.json`,
                s`${rootDir}/grandparent.json`,
                s`${rootDir}/greatgrandparent.json`
            ]);
        });

        it('returns empty ancestors list for non-extends files', () => {
            fsExtra.outputFileSync(s`${rootDir}/child.json`, `{}`);
            let config = util.loadConfigFile(s`${rootDir}/child.json`);
            expect(
                config._ancestors.map(x => s(x))
            ).to.eql([
                s`${rootDir}/child.json`
            ]);
        });

        it('resolves plugins path relatively to config file', () => {
            const config: BsConfig = {
                plugins: [
                    './plugins.js',
                    './scripts/plugins.js',
                    '../scripts/plugins.js',
                    'bsplugin'
                ]
            };
            util.resolvePluginPaths(config, `${rootDir}/config/child.json`);
            expect(config.plugins.map(p => (p ? util.pathSepNormalize(p, '/') : undefined))).to.deep.equal([
                `${rootDir}/config/plugins.js`,
                `${rootDir}/config/scripts/plugins.js`,
                `${rootDir}/scripts/plugins.js`,
                'bsplugin'
            ].map(p => util.pathSepNormalize(p, '/')));
        });

        it('removes duplicate plugins and undefined values', () => {
            const config: BsConfig = {
                plugins: [
                    './plugins.js',
                    'bsplugin',
                    '../config/plugins.js',
                    'bsplugin',
                    undefined
                ]
            };
            util.resolvePluginPaths(config, `${process.cwd()}/config/child.json`);
            expect(config.plugins.map(p => (p ? util.pathSepNormalize(p, '/') : undefined))).to.deep.equal([
                `${process.cwd()}/config/plugins.js`,
                'bsplugin'
            ].map(p => util.pathSepNormalize(p, '/')));
        });
    });

    describe('getConfigFilePath', () => {
        it('returns undefined when it does not find the file', () => {
            let configFilePath = util.getConfigFilePath(s`${process.cwd()}/testProject/project1`);
            expect(configFilePath).not.to.exist;
        });

        it('returns path to file when found', () => {
            fsExtra.outputFileSync(s`${tempDir}/rootDir/bsconfig.json`, '');
            expect(
                util.getConfigFilePath(s`${tempDir}/rootDir`)
            ).to.equal(
                s`${tempDir}/rootDir/bsconfig.json`
            );
        });

        it('finds config file in parent directory', () => {
            const bsconfigPath = s`${tempDir}/rootDir/bsconfig.json`;
            fsExtra.outputFileSync(bsconfigPath, '');
            fsExtra.ensureDirSync(`${tempDir}/rootDir/source`);
            expect(
                util.getConfigFilePath(s`${tempDir}/rootDir/source`)
            ).to.equal(
                s`${tempDir}/rootDir/bsconfig.json`
            );
        });

        it('uses cwd when not provided', () => {
            //sanity check
            expect(util.getConfigFilePath()).not.to.exist;

            const rootDir = s`${tempDir}/rootDir`;

            fsExtra.outputFileSync(`${rootDir}/bsconfig.json`, '');

            fsExtra.ensureDirSync(rootDir);
            process.chdir(rootDir);
            try {
                expect(
                    util.getConfigFilePath()
                ).to.equal(
                    s`${rootDir}/bsconfig.json`
                );
            } finally {
                process.chdir(cwd);
            }
        });
    });

    describe('pathSepNormalize', () => {
        it('works for both types of separators', () => {
            expect(util.pathSepNormalize('c:/some\\path', '\\')).to.equal('c:\\some\\path');
            expect(util.pathSepNormalize('c:/some\\path', '/')).to.equal('c:/some/path');
        });
        it('does not throw when given `undefined`', () => {
            expect(undefined).to.be.undefined;
        });
    });

    describe('lowerDrivePath', () => {
        it('forces drive letters to lower case', () => {
            //unix slashes
            expect(util.driveLetterToLower('C:/projects')).to.equal('c:/projects');
            //windows slashes
            expect(util.driveLetterToLower('C:\\projects')).to.equal(('c:\\projects'));
        });
    });

    describe('findClosestConfigFile', () => {
        it('finds config up the chain', async () => {
            const brsFilePath = s`${rootDir}/src/app.brs`;
            const currentDirBsConfigPath = s`${rootDir}/src/bsconfig.json`;
            const currentDirBrsConfigPath = s`${rootDir}/src/brsconfig.json`;
            const parentDirBsConfigPath = s`${rootDir}/bsconfig.json`;
            const parentDirBrsConfigPath = s`${rootDir}/brsconfig.json`;
            fsExtra.outputFileSync(brsFilePath, '');
            fsExtra.outputFileSync(currentDirBsConfigPath, '');
            fsExtra.outputFileSync(currentDirBrsConfigPath, '');
            fsExtra.outputFileSync(parentDirBsConfigPath, '');
            fsExtra.outputFileSync(parentDirBrsConfigPath, '');

            expect(await util.findClosestConfigFile(brsFilePath)).to.equal(currentDirBsConfigPath);
            fsExtra.removeSync(currentDirBsConfigPath);
            expect(await util.findClosestConfigFile(brsFilePath)).to.equal(currentDirBrsConfigPath);
            fsExtra.removeSync(currentDirBrsConfigPath);
            expect(await util.findClosestConfigFile(brsFilePath)).to.equal(parentDirBsConfigPath);
            fsExtra.removeSync(parentDirBsConfigPath);
            expect(await util.findClosestConfigFile(brsFilePath)).to.equal(parentDirBrsConfigPath);
        });

    });

    describe('normalizeAndResolveConfig', () => {
        it('throws for missing project file', () => {
            expect(() => {
                util.normalizeAndResolveConfig({ project: 'path/does/not/exist/bsconfig.json' });
            }).to.throw;
        });

        it('does not throw for optional missing', () => {
            expect(() => {
                util.normalizeAndResolveConfig({ project: '?path/does/not/exist/bsconfig.json' });

            }).not.to.throw;
        });

        it('throws for missing extends file', () => {
            try {
                fsExtra.outputFileSync(s`${rootDir}/bsconfig.json`, `{ "extends": "path/does/not/exist/bsconfig.json" }`);
                expect(() => {
                    util.normalizeAndResolveConfig({
                        project: s`${rootDir}/bsconfig.json`
                    });
                }).to.throw;
            } finally {
                process.chdir(cwd);
            }
        });

        it('throws for missing extends file', () => {
            fsExtra.outputFileSync(s`${rootDir}/bsconfig.json`, `{ "extends": "?path/does/not/exist/bsconfig.json" }`);
            expect(() => {
                util.normalizeAndResolveConfig({
                    project: s`${rootDir}/bsconfig.json`
                });
            }).not.to.throw;
        });
    });

    describe('normalizeConfig', () => {
        it('sets emitDefinitions to false by default and in edge cases', () => {
            expect(util.normalizeConfig({}).emitDefinitions).to.be.false;
            expect((util as any).normalizeConfig().emitDefinitions).to.be.false;
            expect(util.normalizeConfig(<any>{ emitDefinitions: 123 }).emitDefinitions).to.be.false;
            expect(util.normalizeConfig(<any>{ emitDefinitions: undefined }).emitDefinitions).to.be.false;
            expect(util.normalizeConfig(<any>{ emitDefinitions: 'true' }).emitDefinitions).to.be.false;
        });

        it('loads project from disc', () => {
            fsExtra.outputFileSync(s`${tempDir}/rootDir/bsconfig.json`, `{ "outFile": "customOutDir/pkg.zip" }`);
            let config = util.normalizeAndResolveConfig({
                project: s`${tempDir}/rootDir/bsconfig.json`
            });
            expect(
                config.outFile
            ).to.equal(
                s`${tempDir}/rootDir/customOutDir/pkg.zip`
            );
        });

        it('loads project from disc and extends it', () => {
            //the extends file
            fsExtra.outputFileSync(s`${tempDir}/rootDir/bsconfig.base.json`, `{
                "outFile": "customOutDir/pkg1.zip",
                "rootDir": "core"
            }`);

            //the project file
            fsExtra.outputFileSync(s`${tempDir}/rootDir/bsconfig.json`, `{
                "extends": "bsconfig.base.json",
                "watch": true
            }`);

            let config = util.normalizeAndResolveConfig({ project: s`${tempDir}/rootDir/bsconfig.json` });

            expect(config.outFile).to.equal(s`${tempDir}/rootDir/customOutDir/pkg1.zip`);
            expect(config.rootDir).to.equal(s`${tempDir}/rootDir/core`);
            expect(config.watch).to.equal(true);
        });

        it('overrides parent files array with child files array', () => {
            //the parent file
            fsExtra.outputFileSync(s`${tempDir}/rootDir/bsconfig.parent.json`, `{
                "files": ["base.brs"]
            }`);

            //the project file
            fsExtra.outputFileSync(s`${tempDir}/rootDir/bsconfig.json`, `{
                "extends": "bsconfig.parent.json",
                "files": ["child.brs"]
            }`);

            let config = util.normalizeAndResolveConfig({ project: s`${tempDir}/rootDir/bsconfig.json` });

            expect(config.files).to.eql(['child.brs']);
        });

        it('catches circular dependencies', () => {
            fsExtra.outputFileSync(s`${rootDir}/bsconfig.json`, `{
                "extends": "bsconfig2.json"
            }`);
            fsExtra.outputFileSync(s`${rootDir}/bsconfig2.json`, `{
                "extends": "bsconfig.json"
            }`);

            let threw = false;
            try {
                util.normalizeAndResolveConfig({ project: s`${rootDir}/bsconfig.json` });
            } catch (e) {
                threw = true;
            }
            process.chdir(cwd);
            expect(threw).to.equal(true, 'Should have thrown an error');
            //the test passed
        });

        it('properly handles default for watch', () => {
            let config = util.normalizeAndResolveConfig({ watch: true });
            expect(config.watch).to.be.true;
        });
    });

    describe('areArraysEqual', () => {
        it('finds equal arrays', () => {
            expect(util.areArraysEqual([1, 2], [1, 2])).to.be.true;
            expect(util.areArraysEqual(['cat', 'dog'], ['cat', 'dog'])).to.be.true;
        });
        it('detects non-equal arrays', () => {
            expect(util.areArraysEqual([1, 2], [1])).to.be.false;
            expect(util.areArraysEqual([1, 2], [2])).to.be.false;
            expect(util.areArraysEqual([2], [1])).to.be.false;
            expect(util.areArraysEqual([2], [0])).to.be.false;
            expect(util.areArraysEqual(['cat', 'dog'], ['cat', 'dog', 'mouse'])).to.be.false;
            expect(util.areArraysEqual(['cat', 'dog'], ['dog', 'cat'])).to.be.false;
        });
    });

    describe('stringFormat', () => {
        it('handles out-of-order replacements', () => {
            expect(util.stringFormat('{1}{0}', 'b', 'a')).to.equal('ab');
        });

        it('does not fail on arguments not provided', () => {
            expect(util.stringFormat('{0}{1}', 'a')).to.equal('a{1}');
        });

    });

    describe('getPkgPathFromTarget', () => {
        it('works with both types of separators', () => {
            expect(util.getPkgPathFromTarget('components/component1.xml', '../lib.brs')).to.equal('lib.brs');
            expect(util.getPkgPathFromTarget('components\\component1.xml', '../lib.brs')).to.equal('lib.brs');
        });

        it('resolves single dot directory', () => {
            expect(util.getPkgPathFromTarget('components/component1.xml', './lib.brs')).to.equal(s`components/lib.brs`);
        });

        it('resolves absolute pkg paths as relative paths', () => {
            expect(util.getPkgPathFromTarget('components/component1.xml', 'pkg:/source/lib.brs')).to.equal(s`source/lib.brs`);
            expect(util.getPkgPathFromTarget('components/component1.xml', 'pkg:/lib.brs')).to.equal(`lib.brs`);
        });

        it('resolves gracefully for invalid values', () => {
            expect(util.getPkgPathFromTarget('components/component1.xml', 'pkg:/')).to.equal(null);
            expect(util.getPkgPathFromTarget('components/component1.xml', 'pkg:')).to.equal(null);
            expect(util.getPkgPathFromTarget('components/component1.xml', 'pkg')).to.equal(s`components/pkg`);
        });
    });

    describe('getRelativePath', () => {
        it('works when both files are at the root', () => {
            expect(util.getRelativePath('file.xml', 'file.brs')).to.equal('file.brs');
        });
        it('works when both files are in subfolder', () => {
            expect(util.getRelativePath('sub/file.xml', 'sub/file.brs')).to.equal('file.brs');
        });
        it('works when source in root, target in subdir', () => {
            expect(util.getRelativePath('file.xml', 'sub/file.brs')).to.equal(s`sub/file.brs`);
        });
        it('works when source in sub, target in root', () => {
            expect(util.getRelativePath('sub/file.xml', 'file.brs')).to.equal(s`../file.brs`);
        });
        it('works when source and target are in different subs', () => {
            expect(util.getRelativePath('sub1/file.xml', 'sub2/file.brs')).to.equal(s`../sub2/file.brs`);
        });
    });

    describe('padLeft', () => {
        it('stops at an upper limit to prevent terrible memory explosions', () => {
            expect(util.padLeft('', Number.MAX_VALUE, ' ')).to.be.lengthOf(1000);
        });
    });

    describe('tokenizeByWhitespace', () => {
        it('works with single chars', () => {
            expect(util.tokenizeByWhitespace('a b c')).to.deep.equal([{
                startIndex: 0,
                text: 'a'
            }, {
                startIndex: 2,
                text: 'b'
            },
            {
                startIndex: 4,
                text: 'c'
            }]);
        });

        it('works with tabs', () => {
            expect(util.tokenizeByWhitespace('a\tb\t c')).to.deep.equal([{
                startIndex: 0,
                text: 'a'
            }, {
                startIndex: 2,
                text: 'b'
            },
            {
                startIndex: 5,
                text: 'c'
            }]);

            it('works with leading whitespace', () => {
                expect(util.tokenizeByWhitespace('  \ta\tb\t c')).to.deep.equal([{
                    startIndex: 4,
                    text: 'a'
                }, {
                    startIndex: 6,
                    text: 'b'
                },
                {
                    startIndex: 9,
                    text: 'c'
                }]);
            });

            it('works with multiple characters in a word', () => {
                expect(util.tokenizeByWhitespace('abc 123')).to.deep.equal([{
                    startIndex: 0,
                    text: 'abc'
                }, {
                    startIndex: 4,
                    text: '123'
                }]);
            });
        });
    });

    describe('tokenizeBsDisableComment', () => {
        it('skips non disable comments', () => {
            expect(util.tokenizeBsDisableComment(
                Lexer.scan(`'not disable comment`).tokens[0]
            )).not.to.exist;
        });

        it('tokenizes bs:disable-line comment', () => {
            expect(util.tokenizeBsDisableComment(
                Lexer.scan(`'bs:disable-line`).tokens[0])
            ).to.eql({
                commentTokenText: `'`,
                disableType: 'line',
                codes: []
            });
        });

        it('works for special case', () => {
            expect(util.tokenizeBsDisableComment(
                Lexer.scan(`print "hi" 'bs:disable-line: 123456 999999   aaaab`).tokens[2])
            ).to.eql({
                commentTokenText: `'`,
                disableType: 'line',
                codes: [{
                    code: '123456',
                    range: Range.create(0, 29, 0, 35)
                }, {
                    code: '999999',
                    range: Range.create(0, 36, 0, 42)
                }, {
                    code: 'aaaab',
                    range: Range.create(0, 45, 0, 50)
                }]
            });
        });

        it('tokenizes bs:disable-line comment with codes', () => {
            expect(util.tokenizeBsDisableComment(
                Lexer.scan(`'bs:disable-line:1 2 3`).tokens[0])
            ).to.eql({
                commentTokenText: `'`,
                disableType: 'line',
                codes: [{
                    code: '1',
                    range: Range.create(0, 17, 0, 18)
                }, {
                    code: '2',
                    range: Range.create(0, 19, 0, 20)
                }, {
                    code: '3',
                    range: Range.create(0, 21, 0, 22)
                }]
            });
        });
    });

    describe('getTextForRange', () => {
        const testArray = ['The quick', 'brown fox', 'jumps over', 'the lazy dog'];
        const testString = testArray.join('\n');
        it('should work if string is passed in', () => {
            const result = util.getTextForRange(testString, Range.create(0, 0, 1, 5));
            expect(result).to.equal('The quick\nbrown');
        });

        it('should work if array is passed in', () => {
            const result = util.getTextForRange(testArray, Range.create(0, 0, 1, 5));
            expect(result).to.equal('The quick\nbrown');
        });

        it('should work if start and end are on the same line', () => {
            const result = util.getTextForRange(testArray, Range.create(0, 4, 0, 7));
            expect(result).to.equal('qui');
        });
    });

    describe('compareRangeToPosition', () => {
        it('correctly compares positions to ranges with one line range line', () => {
            let range = Range.create(1, 10, 1, 15);
            expect(util.comparePositionToRange(Position.create(0, 13), range)).to.equal(-1);
            expect(util.comparePositionToRange(Position.create(1, 1), range)).to.equal(-1);
            expect(util.comparePositionToRange(Position.create(1, 9), range)).to.equal(-1);
            expect(util.comparePositionToRange(Position.create(1, 10), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(1, 13), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(1, 15), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(1, 16), range)).to.equal(1);
            expect(util.comparePositionToRange(Position.create(2, 10), range)).to.equal(1);
        });
        it('correctly compares positions to ranges with multiline range', () => {
            let range = Range.create(1, 10, 3, 15);
            expect(util.comparePositionToRange(Position.create(0, 13), range)).to.equal(-1);
            expect(util.comparePositionToRange(Position.create(1, 1), range)).to.equal(-1);
            expect(util.comparePositionToRange(Position.create(1, 9), range)).to.equal(-1);
            expect(util.comparePositionToRange(Position.create(1, 10), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(1, 13), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(1, 15), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(2, 0), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(2, 10), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(2, 13), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(3, 0), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(3, 10), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(3, 13), range)).to.equal(0);
            expect(util.comparePositionToRange(Position.create(3, 16), range)).to.equal(1);
            expect(util.comparePositionToRange(Position.create(4, 10), range)).to.equal(1);
        });
    });
    describe('getExtension', () => {
        it('handles edge cases', () => {
            expect(util.getExtension('main.bs')).to.eql('.bs');
            expect(util.getExtension('main.brs')).to.eql('.brs');
            expect(util.getExtension('main.spec.bs')).to.eql('.bs');
            expect(util.getExtension('main.d.bs')).to.eql('.d.bs');
            expect(util.getExtension('main.xml')).to.eql('.xml');
            expect(util.getExtension('main.component.xml')).to.eql('.xml');
        });
    });

    describe('loadPlugins', () => {

        let pluginPath: string;
        let id = 1;

        beforeEach(() => {
            // `require` caches plugins, so  generate a unique plugin name for every test
            pluginPath = `${tempDir}/plugin${id++}.js`;
        });

        it('shows warning when loading plugin with old "object" format', () => {
            fsExtra.writeFileSync(pluginPath, `
                module.exports = {
                    name: 'AwesomePlugin'
                };
            `);
            const stub = sinon.stub(console, 'warn').callThrough();
            const plugins = util.loadPlugins(cwd, [pluginPath]);
            expect(plugins[0].name).to.eql('AwesomePlugin');
            expect(stub.callCount).to.equal(1);
        });

        it('shows warning when loading plugin with old "object" format and exports.default', () => {
            fsExtra.writeFileSync(pluginPath, `
                module.exports.default = {
                    name: 'AwesomePlugin'
                };
            `);
            const stub = sinon.stub(console, 'warn').callThrough();
            const plugins = util.loadPlugins(cwd, [pluginPath]);
            expect(plugins[0].name).to.eql('AwesomePlugin');
            expect(stub.callCount).to.equal(1);
        });

        it('loads plugin with factory pattern', () => {
            fsExtra.writeFileSync(pluginPath, `
                module.exports = function() {
                    return {
                        name: 'AwesomePlugin'
                    };
                };
            `);
            const stub = sinon.stub(console, 'warn').callThrough();
            const plugins = util.loadPlugins(cwd, [pluginPath]);
            expect(plugins[0].name).to.eql('AwesomePlugin');
            //does not warn about factory pattern
            expect(stub.callCount).to.equal(0);
        });

        it('loads plugin with factory pattern and `default`', () => {
            fsExtra.writeFileSync(pluginPath, `
                module.exports.default = function() {
                    return {
                        name: 'AwesomePlugin'
                    };
                };
            `);
            const stub = sinon.stub(console, 'warn').callThrough();
            const plugins = util.loadPlugins(cwd, [pluginPath]);
            expect(plugins[0].name).to.eql('AwesomePlugin');
            //does not warn about factory pattern
            expect(stub.callCount).to.equal(0);
        });
    });
});
