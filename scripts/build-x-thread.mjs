import { build } from 'esbuild';
await build({ entryPoints:['scripts/x-thread-source.mjs'], outfile:'extension/shared/x-thread.js', bundle:true, format:'iife', platform:'browser', target:'chrome148', minify:true, legalComments:'eof' });
