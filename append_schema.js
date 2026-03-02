const fs = require('fs');

const path = 'e:/FreeLance/edtech/backend-study-mentor/prisma/schema.prisma';
let schema = fs.readFileSync(path, 'utf8');

const newModels = `
model IeltsSpeedReadingReport {
  id          String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  category    String   @db.VarChar(50) 
  title       String   @db.VarChar(255)
  source      String   @db.VarChar(255)
  text        String
  wordCount   Int      @default(0)
  questions   Json?    
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @db.Timestamptz(6)

  IeltsSpeedReadingHistory IeltsSpeedReadingHistory[]
  @@index([category])
}

model IeltsSpeedReadingHistory {
  id                 String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  userId             String   @db.Uuid
  reportId           String   @db.Uuid
  readingTimeSeconds Int
  wpm                Int
  retentionScore     Float    
  createdAt          DateTime @default(now()) @db.Timestamptz(6)

  User                    User                    @relation(fields: [userId], references: [id], onDelete: Cascade)
  IeltsSpeedReadingReport IeltsSpeedReadingReport @relation(fields: [reportId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
`;

if (!schema.includes('IeltsSpeedReadingReport')) {
  fs.appendFileSync(path, newModels);
  
  // also inject the reference into the User model
  if (!schema.includes('IeltsSpeedReadingHistory IeltsSpeedReadingHistory[]')) {
    const userRoleTypeIndex = schema.indexOf('model User {');
    const closingBraceIndex = schema.indexOf('}', userRoleTypeIndex);
    
    const beforeClosing = schema.substring(0, closingBraceIndex - 1);
    const afterClosing = schema.substring(closingBraceIndex - 1);
    
    const newUser = beforeClosing + '  IeltsSpeedReadingHistory IeltsSpeedReadingHistory[]\n' + afterClosing;
    fs.writeFileSync(path, newUser);
    console.log("Appended new columns and added relation to User in schema.prisma");
  } else {
    console.log("Appended new columns but relation to User already exists");
  }
} else {
   console.log("Schema already has IeltsSpeedReadingReport");
}


