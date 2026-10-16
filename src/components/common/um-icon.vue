<script setup lang="ts">
withDefaults(defineProps<{ name?: string }>(), { name: 'grid' });
const standardPaths: Record<string, string> = {thumb:'M7 10v11H3V10h4zM7 10l5-8c3 0 2 5 1 7h7l2 2-3 10H7',search:'M21 21l-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0',bag:'M5 7h14l2 14H3L5 7zM8 8V5a4 4 0 0 1 8 0v3',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',user:'M20 21v-2a7 7 0 0 0-14 0v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',arrow:'M4 12h16M14 6l6 6-6 6',chevron:'M9 5l7 7-7 7',close:'M5 5l14 14M19 5L5 19',menu:'M3 6h18M3 12h18M3 18h18',home:'M3 10l9-8 9 8v11h-7v-7h-4v7H3z',grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',wallet:'M20 7H4V3h15v4M3 7h18v14H3zM16 12h5v5h-5z',box:'M12 2l10 5v10l-10 5-10-5V7l10-5zM2 7l10 5 10-5M12 12v10M7 4l10 5',truck:'M1 5h13v12H1zM14 9h5l4 5v3h-9M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0M21 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0',shield:'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 12l3 3 5-6',headset:'M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v8H3zM17 12h4v8h-4zM17 20l-5 2',pin:'M19 9c0 6-7 13-7 13S5 15 5 9a7 7 0 1 1 14 0zM15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',phone:'M6 2h12v20H6zM10 18h4',laptop:'M4 3h16v13H4zM1 20h22l-3-4H4z',sun:'M12 3v2M12 19v2M3 12h2M19 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',check:'M5 12l4 4L20 5',filter:'M4 7h16M4 17h16M8 4v6M16 14v6',star:'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',chat:'M3 3h18v14H8l-5 4V3zM7 7h10M7 11h7',logout:'M9 3H3v18h6M9 12h13M17 7l5 5-5 5',return:'M9 5l-6 6 6 6M3 11h11a6 6 0 0 1 0 12',plus:'M12 4v16M4 12h16',minus:'M4 12h16',clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',bell:'M5 16V9a7 7 0 0 1 14 0v7l2 3H3zM9 22h6',edit:'M14 4l6 6M3 21l2-7L17 2l5 5-12 12z',trash:'M3 6h18M5 6l1 15h12l1-15M9 6V2h6v4M9 10v7M15 10v7',globe:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M2 12h20M12 2c7 6 7 14 0 20-7-6-7-14 0-20',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'};
const memePaths: Record<string, string> = { ...standardPaths };
Object.assign(memePaths,{
 user:'M4 10 3 3l6 3h6l6-3-1 7v5c0 5-16 5-16 0zM7 11h3m4 0h3M10 15q2 2 4 0M4 22v-2m16 2v-2',
 home:'M3 10V3l6 3h6l6-3v17H3zM7 11h3m4 0h3M10 15q2 2 4 0',
 bag:'M4 8h16l1 13H3zM8 8V5a4 4 0 0 1 8 0v3M7 13h2m6 0h2M10 16q2 2 4 0',
 wallet:'M4 5 17 2v5M3 7h18v14H3zM16 12h6v5h-6zM7 11v5q2 3 4 0v-5',
 grid:'M3 3h7v7H3zM15 2l7 6-6 4-5-5zM3 14h7v7H3zM14 15h7v6h-7z',
 box:'M3 6l9-4 9 4v14H3zM3 6l9 5 9-5M12 11v9M7 3l9 5M5 14h3m8 0h3',
 heart:'M3 8V4h5l4 4 4-4h5v8l-9 9-9-9z',
 star:'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1zM9 11h1m4 0h1',
 headset:'M3 13V9a9 9 0 0 1 18 0v4M3 11h4v9H3zM17 11h4v9h-4zM17 20l-5 2M9 10h1m4 0h1',
 shield:'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6zM8 10v4q4 4 8 0v-4',
 chat:'M3 3h18v14H9l-6 5zM7 8h2m6 0h2M9 12q3 3 6 0',
 fire:'M13 2c2 6-3 7-3 10-2-1-3-3-3-5-8 9-3 15 5 15 9 0 14-12 1-20zM10 16l2-3 3 4-3 3z',
 vault:'M4 5h16v17H4zM2 2h20v4H2zM9 10v5q3 4 6 0v-5M7 22v-3m10 3v-3',
 rocket:'M9 15C8 5 17 2 22 2c0 6-3 14-13 13zM10 8H5l-3 6h7M16 14v5l-6 3v-7M6 18l-3 3M15 7h2v2h-2z'
});
Object.assign(memePaths,{
 thumb:'M3 11h5v10H3zM8 11l5-8 3 1-1 7h6l-2 10H8',
 search:'M3 3h12l3 3v9l-3 3H6l-3-3zM17 17l5 5M7 7h6',
 arrow:'M3 12h17M14 6l6 6-6 6',chevron:'M8 4l8 8-8 8',close:'M5 5l14 14M19 5 5 19',
 menu:'M3 5h18M3 12h13M3 19h18',
 truck:'M2 5h12v12H2zM14 9h5l3 4v4h-8M4 17v4h4v-4m9 0v4h4v-4M5 9h2m3 0h2',
 pin:'M5 3h14v11l-7 8-7-8zM9 7h6v5H9z',
 phone:'M5 2h14v20H5zM8 6h2m4 0h2M10 10q2 2 4 0M10 18h4',
 laptop:'M3 3h18v13H3zM1 21h22l-2-5H3zM8 7h2m4 0h2M10 11q2 2 4 0',
 sun:'M8 7h8l3 5-3 5H8l-3-5zM12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2',
 check:'M4 12l5 5L20 5',filter:'M3 7h18M3 17h18M6 4h4v6H6zM14 14h4v6h-4z',
 logout:'M9 3H3v18h6M9 12h13M17 7l5 5-5 5',return:'M9 4l-6 6 6 6M3 10h12l5 5v6H10',
 plus:'M12 3v18M3 12h18',minus:'M3 12h18',
 clock:'M7 2h10l5 5v10l-5 5H7l-5-5V7zM12 7v6h5',
 bell:'M5 17V8l4-4h6l4 4v9l3 3H2zM10 23h4M9 10h1m4 0h1',
 edit:'M3 21l1-7L17 1l6 6L10 20zM13 5l6 6M3 21l7-1',
 trash:'M3 6h18M5 6l1 16h12l1-16M9 6V2h6v4M9 11v6M15 11v6',
 globe:'M7 2h10l5 5v10l-5 5H7l-5-5V7zM2 12h20M12 2l-4 5v10l4 5 4-5V7z',
 eye:'M2 12l5-7h10l5 7-5 7H7zM9 9h6v6H9z'
});
const paths = memePaths;
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.grid" /></svg>
</template>

<style scoped>
svg { width: 22px; height: 22px; flex-shrink: 0; vertical-align: middle; }
</style>
