<template>
  <div>
    <p>
      Developer friendly modern Javascript library that manages the user interactions
      with the opensips server based in JSSip.
    </p>

    <p>
      The Opensips JS library and its expansive ecosystem offer developers a powerful
      and flexible solution for integrating Opensips protocol functionalities into a
      multitude of applications. Whether building modern web applications, native mobile
      apps, or enhancing legacy systems, the Opensips JS library provides the necessary
      tools and modules to meet diverse development needs. With its modular design and
      comprehensive SDKs, the Opensips JS ecosystem is an essential resource for developers
      looking to leverage the Opensips protocol across various technological landscapes.
    </p>

    <p>
      It includes TypeScript implementation and has large <a href="/ecosystem">ecosystem</a>.
    </p>

    <h3>Sponsored by</h3>
    <div style="display: flex; align-items: center">
      <div v-for="(item, index) in sponsors" :key="index" style="margin: 0 12px;">
        <img :src="item.path" :alt="item.alt" :height="item.height">
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import opensipsLogoUrl from '../public/opensips-logo.png'
import voicenterAnimatedLogoUrl from '../public/voicenter-animated-logo.gif'

const sponsors = [
  {
    path: voicenterAnimatedLogoUrl,
    alt: 'voicenter-animated',
    height: '92'
  },
  {
    path: opensipsLogoUrl,
    alt: 'opensips-js',
    height: '64'
  }
]

</script>
