/*
Copyright (C) 2023-2026 QuantumNous
Copyright (C) 2026 川邮·星语 · AlloMax（二次开发：/docs 文档站动态路由）

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute, redirect } from '@tanstack/react-router'

import { DOC_MAP } from '@/features/api-docs/content/registry'
import { DocsPage } from '@/features/api-docs/docs-site'

export const Route = createFileRoute('/docs/$slug')({
  beforeLoad: ({ params }) => {
    if (!DOC_MAP[params.slug]) {
      throw redirect({ to: '/docs' })
    }
  },
  component: function DocsSlugRoute() {
    const { slug } = Route.useParams()
    return <DocsPage slug={slug} />
  },
})
