import bcrypt from "bcryptjs";
import { PrismaClient, Role, CourseStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertUser(name: string, email: string, password: string, role: Role) {
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role },
    create: { name, email, passwordHash, role }
  });
}

async function main() {
  const admin = await upsertUser("LMS Admin", "admin@lms.local", "admin123", Role.ADMIN);
  const professor = await upsertUser("Training Professor", "professor@lms.local", "professor123", Role.PROFESSOR);
  const student = await upsertUser("Alex Learner", "student@lms.local", "student123", Role.STUDENT);

  const group = await prisma.group.upsert({
    where: { name: "Safety Class 2026" },
    update: {},
    create: { name: "Safety Class 2026" }
  });

  await prisma.groupMembership.upsert({
    where: { userId_groupId: { userId: student.id, groupId: group.id } },
    update: {},
    create: { userId: student.id, groupId: group.id, roleLabel: "learner" }
  });

  const videoOne = await prisma.video.upsert({
    where: { id: "demo-video-intro" },
    update: {},
    create: {
      id: "demo-video-intro",
      title: "Safety introduction",
      description: "Initial overview of the training path.",
      sourceUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      durationSeconds: 30,
      createdById: admin.id,
      h5pConfig: {
        interactions: [
          {
            id: "intro-check",
            time: 8,
            type: "popup",
            title: "Attention check",
            prompt: "Have you understood the goal of this course?"
          }
        ]
      }
    }
  });

  const videoTwo = await prisma.video.upsert({
    where: { id: "demo-video-procedure" },
    update: {},
    create: {
      id: "demo-video-procedure",
      title: "Operational procedures",
      description: "Procedure sequence to follow in class and in the field.",
      sourceUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      durationSeconds: 30,
      createdById: admin.id,
      h5pConfig: {
        interactions: [
          {
            id: "procedure-check",
            time: 12,
            type: "popup",
            title: "Midpoint check",
            prompt: "Which procedure must be completed before moving to the next module?"
          }
        ]
      }
    }
  });

  const course = await prisma.course.upsert({
    where: { id: "demo-course-safety" },
    update: {},
    create: {
      id: "demo-course-safety",
      title: "Basic safety path",
      description: "Demo course with sequential video completion gating.",
      status: CourseStatus.PUBLISHED,
      createdById: professor.id
    }
  });

  await prisma.courseVideo.upsert({
    where: { courseId_videoId: { courseId: course.id, videoId: videoOne.id } },
    update: { position: 1, gatePrevious: false },
    create: { courseId: course.id, videoId: videoOne.id, position: 1, gatePrevious: false }
  });

  await prisma.courseVideo.upsert({
    where: { courseId_videoId: { courseId: course.id, videoId: videoTwo.id } },
    update: { position: 2, gatePrevious: true },
    create: { courseId: course.id, videoId: videoTwo.id, position: 2, gatePrevious: true }
  });

  await prisma.assignment.upsert({
    where: { id: "demo-assignment-group" },
    update: {},
    create: {
      id: "demo-assignment-group",
      courseId: course.id,
      groupId: group.id,
      assignedById: professor.id,
      notes: "Demo assignment for the class group."
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
