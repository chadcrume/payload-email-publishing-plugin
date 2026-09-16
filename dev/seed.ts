import type { Payload } from 'payload'

import { devUser } from './helpers/credentials.js'

export const seed = async (payload: Payload) => {
  const { totalDocs } = await payload.count({
    collection: 'users',
    where: {
      email: {
        equals: devUser.email,
      },
    },
  })

  if (!totalDocs) {
    await payload.create({
      collection: 'users',
      data: devUser,
    })
  }

  const { totalDocs: postCount } = await payload.count({ collection: 'posts' })
  if (!postCount) {
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: 'Welcome to the newsletter',
        content: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [{ type: 'text', text: 'Seeded example post content.', version: 1 }],
                version: 1,
              },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
          },
        },
      },
    })

    const schedulerItem = await payload.create({
      collection: 'scheduler-items',
      data: {
        label: 'Seeded draft campaign',
        status: 'draft',
      },
    })

    await payload.create({
      collection: 'emails',
      data: {
        subject: 'Seeded example email',
        posts: [post.id],
        schedulerItem: schedulerItem.id,
      },
    })
  }
}
