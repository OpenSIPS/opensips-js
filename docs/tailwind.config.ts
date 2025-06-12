import type { Config } from 'tailwindcss'
// import defaultTheme from 'tailwindcss/defaultTheme'

export default <Partial<Config>>{
    theme: {
        extend: {
            colors: {
                yellow: {
                    50: '#f6faee',
                    100: '#ecf4dd',
                    200: '#dae9ba',
                    300: '#bfd784',
                    400: '#aecb5c',
                    500: '#a5c544',
                    600: '#799230',
                    700: '#657926',
                    800: '#3d4b14',
                    900: '#2b350c',
                    950: '#1a2105'
                }
            }
        }
    }
}
