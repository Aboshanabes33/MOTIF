import { describe,expect,it } from 'vitest'
import { resolveWindowsCommand } from '../src/windows-command.ts'
describe('shell-free Windows npm launchers',()=>{
  it('preserves non-Windows commands',()=>expect(resolveWindowsCommand('npm',['install'],{ platform:'linux' })).toEqual({ file:'npm',args:['install'] }))
  it('runs npm shim JavaScript through Node, preserving args with spaces',()=>{
    const answer=resolveWindowsCommand('/tools/npm.cmd',['install','a b'],{ platform:'win32',exists:path=>!path.endsWith('.exe'),read:()=>'%dp0%\\node_modules\\npm\\bin\\npm-cli.js' })
    expect(answer.file).toBe(process.execPath)
    expect(answer.args.slice(1)).toEqual(['install','a b'])
    expect(answer.args[0]).toContain('npm-cli.js')
  })
  it('never executes an unknown batch script',()=>{
    expect(()=>resolveWindowsCommand('/tools/evil.cmd',[],{ platform:'win32',exists:path=>!path.endsWith('.exe'),read:()=> 'arbitrary commands' })).toThrow(/Unsupported/)
  })
  it('accepts an explicit JavaScript entry without a shell',()=>{
    const answer=resolveWindowsCommand('/tools/tool.js',['login'],{ platform:'win32',exists:()=>false })
    expect(answer).toEqual({ file:process.execPath,args:['/tools/tool.js','login'] })
  })
  it('resolves native Windows executables before checking npm shims',()=>{
    const answer=resolveWindowsCommand('/tools/claude',['--version'],{ platform:'win32',exists:path=>path.endsWith('.exe') })
    expect(answer).toEqual({ file:'/tools/claude.exe',args:['--version'] })
  })

})
