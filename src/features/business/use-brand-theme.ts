import { useEffect } from 'react'
import { brandCssVariables, isHexColor } from './brand'

/**
 * Applies the business color to the whole document (dialogs and sheets render in
 * portals, so scoping the variables to a wrapper element would miss them).
 */
export function useBrandTheme(primaryColor: string | undefined) {
  useEffect(() => {
    if (!primaryColor || !isHexColor(primaryColor)) return
    const root = document.documentElement
    const vars = brandCssVariables(primaryColor)
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const previousThemeColor = meta?.content
    if (meta) meta.content = primaryColor
    return () => {
      for (const name of Object.keys(vars)) root.style.removeProperty(name)
      if (meta && previousThemeColor) meta.content = previousThemeColor
    }
  }, [primaryColor])
}
