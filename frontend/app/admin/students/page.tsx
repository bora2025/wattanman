"use client"

import PortalManager from '../../../components/PortalManager'

export default function ManageStudentsPage() {
  return (
    <PortalManager
      title="Student Portal"
      subtitle="Manage student accounts"
      roles={['STUDENT']}
      accent="amber"
    />
  )
}
