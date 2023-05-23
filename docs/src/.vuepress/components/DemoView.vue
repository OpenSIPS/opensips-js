<template>
  <div>
    <iframe src="http://127.0.0.1:5173/"></iframe>
    <!--    <div v-html="htmlContent"></div>-->
  </div>
</template>

<script>
export default {
  data() {
    return {
      htmlContent: ''
    };
  },
  mounted() {
    // Load the HTML file or fetch it from an API

    //this.loadHTMLFile();
  },
  methods: {
    /*loadHTMLFile() {
      // Simulated example - you can replace this with your own logic to load the HTML content
      const htmlFile = 'https://github.com/VoicenterTeam/opensips-js/blob/master/demo/index.html';

      // Fetch the HTML content
      fetch(htmlFile)
          .then(response => response.text())
          .then(data => {
            this.htmlContent = data;
          })
          .catch(error => {
            console.error('Error loading HTML file:', error);
          });
    }*/
  }
};
</script>
