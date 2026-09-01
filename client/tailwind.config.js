/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f6ff",
          100: "#dbe9ff",
          200: "#b7d3ff",
          300: "#8ab6ff",
          400: "#5a91ff",
          500: "#2f6bff",
          600: "#1a4de0",
          700: "#163cb0",
          800: "#15318a",
          900: "#152b6f",
        },
      },
    },
  },
  plugins: [],
};
