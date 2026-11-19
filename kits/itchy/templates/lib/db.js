import Dexie from 'dexie';

export const db = new Dexie('itchy-studio');
db.version(1).stores({
  projects: '++id, name, lastModified, data',
  assets: '++id, name, type, data'
});

export const saveProjectLocally = async (project) => {
  return await db.projects.put({
    ...project,
    lastModified: Date.now()
  });
};

export const getLocalProjects = async () => {
  return await db.projects.orderBy('lastModified').reverse().toArray();
};
