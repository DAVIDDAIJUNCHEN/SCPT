/*
Copyright (C) 2023-2026 QuantumNous
Copyright (C) 2026 川邮·星语 · AlloMax（二次开发：/docs 文档站落地页路由）

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute } from '@tanstack/react-router'

import { DocsLanding } from '@/features/api-docs/docs-site'

export const Route = createFileRoute('/docs/')({
  component: DocsLanding,
})
