type AmmoType = any

export type PhysicsWorld = {
  ammo: AmmoType
  dynamicsWorld: any
  groundBody: any
  playerBody: any
}

let worldPromise: Promise<PhysicsWorld> | null = null

export function initPhysicsWorld(spawn: { x: number; y: number; z: number }): Promise<PhysicsWorld> {
  if (!worldPromise) worldPromise = createWorld(spawn)
  return worldPromise
}

async function createWorld(spawn: { x: number; y: number; z: number }): Promise<PhysicsWorld> {
  const mod: any = await import('ammo.js')
  const factory: any = mod?.default ?? mod
  const Ammo: AmmoType = typeof factory === 'function' ? await factory() : factory

  const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration()
  const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration)
  const broadphase = new Ammo.btDbvtBroadphase()
  const solver = new Ammo.btSequentialImpulseConstraintSolver()
  const dynamicsWorld = new Ammo.btDiscreteDynamicsWorld(
    dispatcher,
    broadphase,
    solver,
    collisionConfiguration,
  )
  dynamicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0))

  const groundShape = new Ammo.btStaticPlaneShape(new Ammo.btVector3(0, 1, 0), 0)
  const groundTransform = new Ammo.btTransform()
  groundTransform.setIdentity()
  groundTransform.setOrigin(new Ammo.btVector3(0, 0, 0))
  const groundMotion = new Ammo.btDefaultMotionState(groundTransform)
  const groundRbInfo = new Ammo.btRigidBodyConstructionInfo(
    0,
    groundMotion,
    groundShape,
    new Ammo.btVector3(0, 0, 0),
  )
  const groundBody = new Ammo.btRigidBody(groundRbInfo)
  dynamicsWorld.addRigidBody(groundBody)

  const radius = 0.4
  const height = 1.2
  const playerShape = new Ammo.btCapsuleShape(radius, height)
  const startTransform = new Ammo.btTransform()
  startTransform.setIdentity()
  startTransform.setOrigin(new Ammo.btVector3(spawn.x, spawn.y + 1.0, spawn.z))
  const mass = 1
  const localInertia = new Ammo.btVector3(0, 0, 0)
  playerShape.calculateLocalInertia(mass, localInertia)
  const motionState = new Ammo.btDefaultMotionState(startTransform)
  const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, playerShape, localInertia)
  const playerBody = new Ammo.btRigidBody(rbInfo)
  playerBody.setAngularFactor(new Ammo.btVector3(0, 0, 0))
  dynamicsWorld.addRigidBody(playerBody)

  return { ammo: Ammo, dynamicsWorld, groundBody, playerBody }
}

export function createSphereBody(
  world: PhysicsWorld,
  opts: { radius: number; mass: number; x: number; y: number; z: number; vx: number; vy: number; vz: number },
) {
  const Ammo = world.ammo
  const shape = new Ammo.btSphereShape(opts.radius)
  const transform = new Ammo.btTransform()
  transform.setIdentity()
  transform.setOrigin(new Ammo.btVector3(opts.x, opts.y, opts.z))
  const motion = new Ammo.btDefaultMotionState(transform)
  const inertia = new Ammo.btVector3(0, 0, 0)
  shape.calculateLocalInertia(opts.mass, inertia)
  const info = new Ammo.btRigidBodyConstructionInfo(opts.mass, motion, shape, inertia)
  const body = new Ammo.btRigidBody(info)
  body.setLinearVelocity(new Ammo.btVector3(opts.vx, opts.vy, opts.vz))
  world.dynamicsWorld.addRigidBody(body)
  return body
}

export function removeBody(world: PhysicsWorld, body: any) {
  world.dynamicsWorld.removeRigidBody(body)
}

