import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'KidCode Studio',
  description: 'Visual programming for kids',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-itchy-workspace overflow-hidden`}>
        {children}
      </body>
    </html>
  )
}
