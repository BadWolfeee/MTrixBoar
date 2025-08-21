/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        // Paths to your templates
        './Views/**/*.cshtml',
        './wwwroot/js/**/*.js' // For any inline classes in JavaScript files
    ],
  theme: {
    extend: {},
  },
  plugins: [],
}

