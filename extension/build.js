import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/content.js', 'src/popup.js', 'src/background.js'],
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome120',
  minify: !watch,
  sourcemap: watch,
  define: {
    'process.env.NODE_ENV': '"production"'
  }
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete');
}
