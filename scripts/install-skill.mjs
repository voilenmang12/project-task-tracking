#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../skills/nhanh-project-tracking');
try{
  const args=process.argv.slice(2);
  if(args.length&&(args.length!==2||args[0]!=='--target'))throw Error('Usage: node scripts/install-skill.mjs [--target <skills-directory>]');
  const parent=args[1]||path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'skills');
  const dest=path.resolve(parent,'nhanh-project-tracking');
  await fs.mkdir(path.dirname(dest),{recursive:true});
  // Never overwrite an installed skill or follow a pre-existing destination symlink.
  await fs.mkdir(dest);
  await fs.cp(source,dest,{recursive:true,errorOnExist:true,force:false});
  console.log(JSON.stringify({installed:dest,instructions:path.join(dest,'SKILL.md')}));
}catch(e){console.error(e.code==='EEXIST'?'Skill already exists; inspect or move the existing installation before upgrading.':e.message);process.exitCode=1;}
