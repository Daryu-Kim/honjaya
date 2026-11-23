<template>
  <div class="admin-discord-view">
    <header class="page-header">
      <div class="header-left">
        <p class="eyebrow">DISCORD</p>
        <h1>디스코드 관리</h1>
        <p class="description">
          혼자야 디스코드 서버 현황과 암호화 백업을 확인하는 화면이에요.
          봇이 꺼져 있으면 서버 정보는 보이지 않고 백업 이력만 남습니다.
        </p>
      </div>
      <div class="panel-actions">
        <button type="button" class="preset-button" :disabled="refreshing" @click="refreshAll">
          {{ refreshing ? "불러오는 중…" : "새로고침" }}
        </button>
      </div>
    </header>

    <p v-if="statusError" class="error-box">{{ statusError }}</p>
    <p v-if="botUnavailableMessage" class="error-box">
      봇 연결 실패: {{ botUnavailableMessage }}
    </p>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">봇 상태</span>
        <strong>{{ botReady ? "온라인" : "오프라인" }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">멤버</span>
        <strong>{{ formatCount(memberCount) }}명</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">채널 / 역할</span>
        <strong>{{ formatCount(channelCount) }} / {{ formatCount(roleCount) }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">대기 작업</span>
        <strong>{{ formatCount(jobDepth) }}건</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">최근 백업</span>
        <strong>{{ latestBackupLabel }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">최근 스냅샷</span>
        <strong>{{ latestSnapshotLabel }}</strong>
      </article>
    </section>

    <section class="tab-row">
      <button
        v-for="tab in TABS"
        :key="tab.value"
        type="button"
        class="tab-button"
        :class="{ active: activeTab === tab.value }"
        @click="selectTab(tab.value)"
      >
        {{ tab.label }}
      </button>
    </section>

    <!-- 개요 -->
    <template v-if="activeTab === 'overview'">
      <section class="panel">
        <div class="panel-head">
          <h2>봇 상태</h2>
        </div>
        <p v-if="!botInfo" class="empty-box">봇 상태를 불러오지 못했어요.</p>
        <template v-else>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">게이트웨이</span>
              <strong :class="botReady ? 'text-ok' : 'text-bad'">
                {{ botReady ? "연결됨" : "끊김" }}
              </strong>
            </div>
            <div class="info-item">
              <span class="info-label">핑</span>
              <strong>{{ botInfo.pingMs === null || botInfo.pingMs === undefined ? "-" : `${botInfo.pingMs}ms` }}</strong>
            </div>
            <div class="info-item">
              <span class="info-label">마지막 연결</span>
              <strong>{{ formatDiscordDateTime(botInfo.lastReadyAt) }}</strong>
            </div>
            <div class="info-item">
              <span class="info-label">봇 계정</span>
              <strong>{{ botInfo.user?.tag || "-" }}</strong>
            </div>
            <div class="info-item">
              <span class="info-label">설정된 길드 ID</span>
              <strong class="mono">{{ botInfo.guildId || "-" }}</strong>
            </div>
            <div class="info-item">
              <span class="info-label">대기 / 진행 중 작업</span>
              <strong>{{ jobDepth }} / {{ botInfo.jobs?.RUNNING ?? 0 }}</strong>
            </div>
          </div>
          <p v-if="botInfo.lastError" class="error-box">마지막 오류: {{ botInfo.lastError }}</p>
          <ul v-if="botProblems.length > 0" class="problem-list">
            <li v-for="problem in botProblems" :key="problem">{{ problem }}</li>
          </ul>
        </template>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>서버 정보</h2>
        </div>
        <p v-if="guildLoading && !guild" class="empty-box">서버 정보를 불러오는 중…</p>
        <p v-else-if="guildError" class="empty-box">{{ guildError }}</p>
        <div v-else-if="guild" class="guild-card">
          <img v-if="guild.guild.iconUrl" :src="guild.guild.iconUrl" alt="서버 아이콘" class="guild-icon" />
          <div class="guild-body">
            <h3>{{ guild.guild.name }}</h3>
            <p class="sub-text mono">{{ guild.guild.id }}</p>
            <div class="chip-row">
              <span class="badge-muted">멤버 {{ formatCount(guild.guild.memberCount) }}</span>
              <span class="badge-muted">채널 {{ formatCount(guild.summary.channels) }}</span>
              <span class="badge-muted">역할 {{ formatCount(guild.summary.roles) }}</span>
              <span class="badge-muted">이모지 {{ formatCount(guild.summary.emojis) }}</span>
              <span class="badge-muted">자동관리 {{ formatCount(guild.summary.autoModeration) }}</span>
              <span class="badge-muted">이벤트 {{ formatCount(guild.summary.scheduledEvents) }}</span>
            </div>
            <p class="sub-text">생성일 {{ formatDiscordDateTime(guild.guild.createdAt) }}</p>
            <p v-if="guild.bot" class="sub-text">
              봇 최상위 역할 {{ guild.bot.highestRole?.name || "-" }} · 권한 {{ guild.bot.permissions.length }}개
            </p>
            <p class="sub-text">불러온 시각 {{ formatDiscordDateTime(guild.fetchedAt) }}</p>
          </div>
        </div>
        <p v-else class="empty-box">서버 정보가 없습니다.</p>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>백업 설정 (읽기 전용)</h2>
        </div>
        <div v-if="settings" class="info-grid">
          <div class="info-item">
            <span class="info-label">백업 스케줄</span>
            <strong class="mono">{{ settings.backup_cron || "-" }}</strong>
          </div>
          <div class="info-item">
            <span class="info-label">다음 실행</span>
            <strong>{{ formatDiscordDateTime(settings.next_backup_at) }}</strong>
          </div>
          <div class="info-item">
            <span class="info-label">보관 (일/주/월)</span>
            <strong>{{ settings.keep_daily }} / {{ settings.keep_weekly }} / {{ settings.keep_monthly }}</strong>
          </div>
          <div class="info-item">
            <span class="info-label">업로드 한도</span>
            <strong>{{ botInfo?.backupUploadLimitMb ? `${botInfo.backupUploadLimitMb} MB` : "-" }}</strong>
          </div>
          <div class="info-item">
            <span class="info-label">백업 채널 ID</span>
            <strong class="mono">{{ settings.backup_channel_id || "-" }}</strong>
          </div>
          <div class="info-item">
            <span class="info-label">공지 채널 ID</span>
            <strong class="mono">{{ settings.announce_channel_id || "-" }}</strong>
          </div>
        </div>
        <p v-else class="empty-box">백업 설정을 불러오지 못했어요.</p>
        <p class="notice-text">
          설정 변경은 P12F 에서 다룹니다.
        </p>
      </section>
    </template>

    <!-- 채널 -->
    <section v-else-if="activeTab === 'channels'" class="panel">
      <div class="panel-head">
        <h2>채널 구조</h2>
        <div class="panel-actions">
          <input v-model="channelQuery" type="search" placeholder="채널 이름 검색" class="search-input" />
        </div>
      </div>
      <p v-if="guildError" class="empty-box">{{ guildError }}</p>
      <p v-else-if="!guild" class="empty-box">채널 정보를 불러오는 중…</p>
      <template v-else>
        <div v-for="group in channelGroups" :key="group.id || 'none'" class="channel-group">
          <h3 class="channel-group-title">
            {{ group.name }}
            <span class="sub-text">{{ group.children.length }}개</span>
          </h3>
          <ul class="channel-list">
            <li v-for="channel in group.children" :key="channel.id" class="channel-item">
              <div class="channel-main">
                <span class="channel-name">{{ channel.name || channel.id }}</span>
                <span class="badge-muted">{{ getChannelTypeLabel(channel.typeName) }}</span>
                <span v-if="channel.topic" class="sub-text">{{ channel.topic }}</span>
                <span v-if="channel.rateLimitPerUser" class="sub-text">
                  슬로우 {{ channel.rateLimitPerUser }}초
                </span>
                <span v-if="channel.userLimit" class="sub-text">정원 {{ channel.userLimit }}명</span>
              </div>
              <button
                v-if="channel.overwrites.length > 0"
                type="button"
                class="link-button"
                @click="toggleChannelOverwrites(channel.id)"
              >
                권한 {{ channel.overwrites.length }}건
                {{ openChannelId === channel.id ? "접기" : "보기" }}
              </button>
              <ul v-if="openChannelId === channel.id" class="overwrite-list">
                <li v-for="overwrite in channel.overwrites" :key="overwrite.id">
                  <strong>{{ overwrite.name }}</strong>
                  <span class="sub-text">{{ overwrite.kind === "role" ? "역할" : "멤버" }}</span>
                  <span v-if="overwrite.allow.length > 0" class="badge-on">
                    허용 {{ overwrite.allow.join(", ") }}
                  </span>
                  <span v-if="overwrite.deny.length > 0" class="badge-off">
                    거부 {{ overwrite.deny.join(", ") }}
                  </span>
                </li>
              </ul>
            </li>
          </ul>
        </div>
        <p v-if="channelGroups.length === 0" class="empty-box">조건에 맞는 채널이 없어요.</p>
      </template>
    </section>

    <!-- 역할 -->
    <section v-else-if="activeTab === 'roles'" class="panel">
      <div class="panel-head">
        <h2>역할</h2>
        <div class="panel-actions">
          <label class="check-item">
            <input v-model="onlyDangerousRoles" type="checkbox" />
            위험 권한만 보기
          </label>
        </div>
      </div>
      <p v-if="guildError" class="empty-box">{{ guildError }}</p>
      <p v-else-if="!guild" class="empty-box">역할 정보를 불러오는 중…</p>
      <div v-else class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>역할</th>
              <th>순서</th>
              <th>멤버</th>
              <th>권한</th>
              <th>봇 수정</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="role in filteredRoles" :key="role.id">
              <td>
                <span class="role-dot" :style="{ backgroundColor: roleColor(role.color) }"></span>
                <strong :style="roleColorStyle(role.color)">{{ role.name }}</strong>
                <span v-if="role.managed" class="badge-muted">연동됨</span>
                <span v-if="role.isEveryone" class="badge-muted">기본</span>
              </td>
              <td>{{ role.position }}</td>
              <td>{{ role.memberCount === null ? "-" : `${role.memberCount}명` }}</td>
              <td class="permission-cell">
                <span
                  v-for="permission in role.permissions"
                  :key="permission.name"
                  class="badge-muted permission-badge"
                  :class="{ 'badge-off': permission.dangerous }"
                >
                  {{ permission.label }}
                </span>
                <span v-if="role.permissions.length === 0" class="sub-text">없음</span>
              </td>
              <td>{{ role.editableByBot ? "가능" : "-" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 멤버 -->
    <section v-else-if="activeTab === 'members'" class="panel">
      <div class="panel-head">
        <h2>멤버</h2>
        <div class="panel-actions">
          <input v-model="memberQuery" type="search" placeholder="이름 또는 닉네임" class="search-input" />
          <select v-model="memberRoleId" class="search-input">
            <option value="">전체 역할</option>
            <option v-for="role in assignableRoles" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select>
          <button type="button" class="preset-button" :disabled="membersLoading" @click="loadMembers()">
            검색
          </button>
        </div>
      </div>
      <p v-if="membersError" class="error-box">{{ membersError }}</p>
      <p v-if="membersWarning" class="notice-text">{{ membersWarning }}</p>
      <p v-if="membersLoading && memberList.length === 0" class="empty-box">멤버를 불러오는 중…</p>
      <p v-else-if="memberList.length === 0" class="empty-box">조건에 맞는 멤버가 없어요.</p>
      <ul v-else class="member-list">
        <li v-for="member in memberList" :key="member.id" class="member-item">
          <img v-if="member.avatarUrl" :src="member.avatarUrl" alt="" class="member-avatar" />
          <div class="member-body">
            <p class="member-name">
              {{ member.displayName }}
              <span class="sub-text">@{{ member.username }}</span>
              <span v-if="member.bot" class="badge-muted">봇</span>
              <span v-if="member.timedOutUntil" class="badge-off">타임아웃</span>
            </p>
            <div class="chip-row">
              <span v-for="role in member.roles" :key="role.id" class="badge-muted" :style="roleColorStyle(role.color)">
                {{ role.name }}
              </span>
            </div>
            <p class="sub-text">가입 {{ formatDiscordDateTime(member.joinedAt) }}</p>
          </div>
        </li>
      </ul>
      <div v-if="membersNextAfter" class="panel-actions">
        <button type="button" class="preset-button" :disabled="membersLoading" @click="loadMoreMembers">
          더 보기
        </button>
      </div>
    </section>

    <!-- 감사로그 -->
    <section v-else-if="activeTab === 'audit'" class="panel">
      <div class="panel-head">
        <h2>감사로그</h2>
        <div class="panel-actions">
          <button type="button" class="preset-button" :disabled="auditLoading" @click="loadAuditLogs()">
            새로고침
          </button>
        </div>
      </div>
      <p v-if="auditError" class="error-box">{{ auditError }}</p>
      <p v-if="auditLoading && auditList.length === 0" class="empty-box">감사로그를 불러오는 중…</p>
      <p v-else-if="auditList.length === 0" class="empty-box">감사로그가 없어요.</p>
      <ul v-else class="audit-list">
        <li v-for="entry in auditList" :key="entry.id" class="audit-item">
          <div class="audit-main">
            <strong>{{ entry.actionLabel || entry.actionName }}</strong>
            <span class="sub-text">{{ entry.executorName || entry.executorId }}</span>
            <span v-if="entry.targetName" class="sub-text">→ {{ entry.targetName }}</span>
            <span class="sub-text">{{ formatDiscordDateTime(entry.createdAt) }}</span>
          </div>
          <p v-if="entry.reason" class="sub-text">사유: {{ entry.reason }}</p>
          <p v-if="entry.changes && entry.changes.length > 0" class="sub-text">
            변경 {{ entry.changes.length }}건: {{ describeChanges(entry.changes) }}
          </p>
        </li>
      </ul>
      <div v-if="auditNextBefore" class="panel-actions">
        <button type="button" class="preset-button" :disabled="auditLoading" @click="loadMoreAuditLogs">
          더 보기
        </button>
      </div>
    </section>

    <!-- 백업 -->
    <section v-else-if="activeTab === 'backups'" class="panel">
      <div class="panel-head">
        <h2>백업 이력</h2>
        <div class="panel-actions">
          <button type="button" class="preset-button" :disabled="!canBackup || backupRunning" @click="requestBackup">
            지금 백업
          </button>
          <button type="button" class="preset-button" :disabled="backupsLoading" @click="loadBackups">
            새로고침
          </button>
        </div>
      </div>
      <p v-if="!canBackup" class="notice-text">백업 실행·검증·내려받기는 사장 계정만 할 수 있어요.</p>
      <p v-if="backupMessage" class="notice-text">{{ backupMessage }}</p>
      <p v-if="backupsError" class="error-box">{{ backupsError }}</p>
      <p v-if="backupsLoading && backupList.length === 0" class="empty-box">백업 이력을 불러오는 중…</p>
      <p v-else-if="backupList.length === 0" class="empty-box">백업 이력이 없어요.</p>
      <div v-else class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>시작</th>
              <th>상태</th>
              <th>크기</th>
              <th>파일</th>
              <th>검증</th>
              <th>만든 사람</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in backupList" :key="run.id">
              <td>{{ formatDiscordDateTime(run.started_at) }}</td>
              <td>
                <span :class="run.status === 'SUCCEEDED' ? 'badge-on' : run.status === 'FAILED' ? 'badge-off' : 'badge-muted'">
                  {{ getBackupStatusLabel(run.status) }}
                </span>
                <span v-if="run.error" class="sub-text">{{ run.error }}</span>
              </td>
              <td>{{ formatBytes(run.size_bytes) }}</td>
              <td>{{ run.part_count }}조각 / 업로드 {{ run.uploaded_parts }}조각</td>
              <td>{{ run.last_verify_status ? getVerifyStatusLabel(run.last_verify_status) : "-" }}</td>
              <td>{{ run.triggered_by || "-" }}</td>
              <td class="action-cell">
                <button type="button" class="preset-button" @click="openBackupDetail(run.id)">
                  {{ selectedRunId === run.id ? "닫기" : "상세" }}
                </button>
                <button
                  type="button"
                  class="preset-button"
                  :disabled="!canBackup || run.status !== 'SUCCEEDED'"
                  @click="verifyRun(run.id)"
                >
                  검증
                </button>
                <button
                  type="button"
                  class="preset-button"
                  :disabled="!canBackup || run.status !== 'SUCCEEDED'"
                  @click="downloadRun(run)"
                >
                  내려받기
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="selectedRun" class="detail-box">
        <div class="panel-head">
          <h3>백업 상세 · {{ formatDiscordDateTime(selectedRun.started_at) }}</h3>
        </div>
        <p class="sub-text mono">{{ selectedRun.filename }}</p>
        <p class="sub-text">
          sha256 {{ selectedRun.sha256 || "-" }} · 키 {{ selectedRun.key_id || "-" }} ·
          암호화 {{ selectedRun.encrypted ? "적용" : "없음" }}
        </p>
        <div class="table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>조각</th>
                <th>파일명</th>
                <th>크기</th>
                <th>업로드</th>
                <th>업로드 시각</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="file in selectedRun.files" :key="file.id">
                <td>{{ file.part_no }} / {{ file.part_count }}</td>
                <td class="mono">{{ file.filename }}</td>
                <td>{{ formatBytes(file.size_bytes) }}</td>
                <td>{{ getUploadStatusLabel(file.upload_status) }}</td>
                <td>{{ formatDiscordDateTime(file.uploaded_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <template v-if="selectedRun.restores.length > 0">
          <h4>복원 · 검증 기록</h4>
          <ul class="audit-list">
            <li v-for="restore in selectedRun.restores" :key="restore.id" class="audit-item">
              <div class="audit-main">
                <strong>{{ restore.mode === "VERIFY" ? "검증" : "운영 복원" }}</strong>
                <span class="sub-text">{{ getVerifyStatusLabel(restore.status) }}</span>
                <span class="sub-text">{{ restore.target_db || "-" }}</span>
                <span class="sub-text">{{ formatDiscordDateTime(restore.started_at) }}</span>
              </div>
              <p v-if="restore.error" class="sub-text">{{ restore.error }}</p>
            </li>
          </ul>
        </template>
      </div>
    </section>

    <!-- 스냅샷 -->
    <section v-else-if="activeTab === 'snapshots'" class="panel">
      <div class="panel-head">
        <h2>구조 스냅샷</h2>
        <div class="panel-actions">
          <button
            type="button"
            class="preset-button"
            :disabled="!canManage || snapshotRunning"
            @click="requestSnapshot"
          >
            지금 스냅샷
          </button>
          <button type="button" class="preset-button" :disabled="snapshotsLoading" @click="loadSnapshots">
            새로고침
          </button>
        </div>
      </div>
      <p v-if="snapshotMessage" class="notice-text">{{ snapshotMessage }}</p>
      <p v-if="snapshotsError" class="error-box">{{ snapshotsError }}</p>
      <p v-if="snapshotsLoading && snapshotList.length === 0" class="empty-box">스냅샷을 불러오는 중…</p>
      <p v-else-if="snapshotList.length === 0" class="empty-box">스냅샷이 없어요.</p>
      <div v-else class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>시각</th>
              <th>종류</th>
              <th>채널 / 역할 / 멤버</th>
              <th>해시</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="snapshot in snapshotList" :key="snapshot.id">
              <td>{{ formatDiscordDateTime(snapshot.captured_at) }}</td>
              <td>{{ getSnapshotReasonLabel(snapshot.reason) }}</td>
              <td>
                {{ formatCount(snapshot.channel_count) }} / {{ formatCount(snapshot.role_count) }} /
                {{ formatCount(snapshot.member_count) }}
              </td>
              <td class="mono">{{ String(snapshot.structure_hash || "").slice(0, 10) }}</td>
              <td class="action-cell">
                <button type="button" class="preset-button" @click="toggleSnapshotDiff(snapshot.id)">
                  {{ selectedSnapshotId === snapshot.id ? "닫기" : "이전과 비교" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="selectedSnapshotId" class="detail-box">
        <div class="panel-head">
          <h3>변경 내용</h3>
        </div>
        <p v-if="diffLoading" class="empty-box">비교하는 중…</p>
        <p v-else-if="diffError" class="empty-box">{{ diffError }}</p>
        <template v-else-if="diff">
          <p class="sub-text">
            기준 {{ formatDiscordDateTime(diff.base.capturedAt) }} ({{ getSnapshotReasonLabel(diff.base.reason) }})
            → 비교 {{ formatDiscordDateTime(diff.target.capturedAt) }}
            ({{ getSnapshotReasonLabel(diff.target.reason) }})
          </p>
          <p v-if="diff.diff.same" class="empty-box">변경 없음</p>
          <template v-else>
            <p>
              총 {{ diff.diff.totalChanges }}건 변경
            </p>
            <div v-for="section in diffSections" :key="section.key" class="diff-section">
              <h4>
                {{ section.label }}
                <span class="sub-text">
                  +{{ section.counts.added }} / -{{ section.counts.removed }} / ~{{ section.counts.changed }}
                </span>
              </h4>
              <ul class="diff-list">
                <li v-for="item in section.added" :key="`add-${item.id}`" class="diff-added">
                  추가: {{ item.name }}
                </li>
                <li v-for="item in section.removed" :key="`del-${item.id}`" class="diff-removed">
                  삭제: {{ item.name }}
                </li>
                <li v-for="item in section.changed" :key="`chg-${item.id}`" class="diff-changed">
                  변경: {{ item.name }}
                  <span class="sub-text">
                    {{ item.fields.map((field) => getDiffFieldLabel(field.key)).join(", ") }}
                  </span>
                </li>
              </ul>
            </div>
            <div v-if="diff.diff.guild.length > 0" class="diff-section">
              <h4>서버 설정</h4>
              <ul class="diff-list">
                <li v-for="field in diff.diff.guild" :key="`guild-${field.key}`" class="diff-changed">
                  {{ getDiffFieldLabel(field.key) }}: {{ formatDiffValue(field.before) }} →
                  {{ formatDiffValue(field.after) }}
                </li>
              </ul>
            </div>
          </template>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";

import {
  downloadDiscordBackup,
  createDiscordSnapshot,
  fetchDiscordAuditLogs,
  fetchDiscordBackup,
  fetchDiscordBackups,
  fetchDiscordGuild,
  fetchDiscordMembers,
  fetchDiscordSnapshotDiff,
  fetchDiscordSnapshots,
  fetchDiscordStatus,
  getBackupStatusLabel,
  getChannelTypeLabel,
  getDiffFieldLabel,
  getSnapshotReasonLabel,
  getUploadStatusLabel,
  getVerifyStatusLabel,
  formatBytes,
  formatDiscordDateTime,
  roleColorStyle,
  runDiscordBackup,
  verifyDiscordBackup,
} from "@/lib/discord";
import { hasPermission } from "@/lib/staffAuth";

const TABS = [
  { value: "overview", label: "개요" },
  { value: "channels", label: "채널" },
  { value: "roles", label: "역할" },
  { value: "members", label: "멤버" },
  { value: "audit", label: "감사로그" },
  { value: "backups", label: "백업" },
  { value: "snapshots", label: "스냅샷" },
];

const canManage = computed(() => hasPermission("discord.manage"));
const canBackup = computed(() => hasPermission("discord.backup"));

const activeTab = ref("overview");
const refreshing = ref(false);

const status = ref(null);
const statusError = ref("");
const guild = ref(null);
const guildLoading = ref(false);
const guildError = ref("");

const botInfo = computed(() => {
  const bot = status.value?.bot || null;

  if (!bot || bot.unavailable) return null;

  return bot;
});
const botReady = computed(() => Boolean(botInfo.value?.ready));
const botUnavailableMessage = computed(() => {
  const bot = status.value?.bot;

  if (bot?.unavailable) return bot.message || "봇에 연결하지 못했어요.";

  return "";
});
const botProblems = computed(() => botInfo.value?.problems || []);
const jobDepth = computed(() => botInfo.value?.jobs?.QUEUED ?? 0);
const settings = computed(() => status.value?.settings || null);

const memberCount = computed(
  () => guild.value?.guild?.memberCount ?? botInfo.value?.guild?.memberCount ?? null,
);
const channelCount = computed(
  () => guild.value?.summary?.channels ?? botInfo.value?.guild?.channelCount ?? null,
);
const roleCount = computed(
  () => guild.value?.summary?.roles ?? botInfo.value?.guild?.roleCount ?? null,
);

// ── 채널 ────────────────────────────────────────────────────────────────────
const channelQuery = ref("");
const openChannelId = ref("");

const channelGroups = computed(() => {
  const channels = guild.value?.channels || [];
  const term = channelQuery.value.trim().toLowerCase();
  const categories = channels
    .filter((channel) => channel.typeName === "GuildCategory")
    .sort((a, b) => a.position - b.position);

  const groups = categories
    .map((category) => ({
      id: category.id,
      name: category.name || "(이름 없는 카테고리)",
      children: channels
        .filter((channel) => channel.parentId === category.id && channel.typeName !== "GuildCategory")
        .sort((a, b) => a.position - b.position || String(a.name).localeCompare(String(b.name))),
    }))
    .filter((group) =>
      term ? group.children.some((channel) => matchesChannel(channel, term)) : true,
    );

  const orphans = channels
    .filter((channel) => channel.typeName !== "GuildCategory" && !channel.parentId)
    .sort((a, b) => a.position - b.position || String(a.name).localeCompare(String(b.name)));

  const result = [];

  if (orphans.length > 0) {
    result.push({ id: "", name: "카테고리 없음", children: orphans });
  }

  return [...result, ...groups]
    .map((group) => ({
      ...group,
      children: term
        ? group.children.filter((channel) => matchesChannel(channel, term))
        : group.children,
    }))
    .filter((group) => group.children.length > 0);
});

function matchesChannel(channel, term) {
  return String(channel.name || "").toLowerCase().includes(term);
}

function toggleChannelOverwrites(channelId) {
  openChannelId.value = openChannelId.value === channelId ? "" : channelId;
}

// ── 역할 ────────────────────────────────────────────────────────────────────
const onlyDangerousRoles = ref(false);

const filteredRoles = computed(() => {
  const roles = guild.value?.roles || [];

  if (!onlyDangerousRoles.value) return roles;

  return roles.filter((role) => role.dangerousPermissions.length > 0);
});

const assignableRoles = computed(() => {
  return (guild.value?.roles || []).filter((role) => !role.isEveryone && !role.managed);
});

function roleColor(color) {
  const value = Number(color || 0);

  if (!value) return "rgba(255,255,255,0.28)";

  return `#${value.toString(16).padStart(6, "0")}`;
}

// ── 멤버 ────────────────────────────────────────────────────────────────────
const memberQuery = ref("");
const memberRoleId = ref("");
const memberList = ref([]);
const membersLoading = ref(false);
const membersError = ref("");
const membersWarning = ref("");
const membersNextAfter = ref("");

async function loadMembers({ append = false } = {}) {
  if (membersLoading.value) return;

  membersLoading.value = true;
  membersError.value = "";

  try {
    const data = await fetchDiscordMembers({
      query: memberQuery.value.trim(),
      roleId: memberRoleId.value,
      after: append ? membersNextAfter.value : "",
      limit: 50,
    });

    memberList.value = append ? [...memberList.value, ...(data.members || [])] : data.members || [];
    membersNextAfter.value = data.nextAfter || "";
    membersWarning.value = data.warning || "";
  } catch (error) {
    membersError.value = error?.message || "멤버를 불러오지 못했어요.";
  } finally {
    membersLoading.value = false;
  }
}

function loadMoreMembers() {
  return loadMembers({ append: true });
}

// ── 감사로그 ────────────────────────────────────────────────────────────────
const auditList = ref([]);
const auditLoading = ref(false);
const auditError = ref("");
const auditNextBefore = ref("");

async function loadAuditLogs({ append = false } = {}) {
  if (auditLoading.value) return;

  auditLoading.value = true;
  auditError.value = "";

  try {
    const data = await fetchDiscordAuditLogs({
      before: append ? auditNextBefore.value : "",
      limit: 40,
    });

    auditList.value = append ? [...auditList.value, ...(data.entries || [])] : data.entries || [];
    auditNextBefore.value = data.nextBefore || "";
  } catch (error) {
    auditError.value = error?.message || "감사로그를 불러오지 못했어요.";
  } finally {
    auditLoading.value = false;
  }
}

function loadMoreAuditLogs() {
  return loadAuditLogs({ append: true });
}

function describeChanges(changes) {
  return changes
    .map((change) => {
      const key = change?.key || change?.name || "";
      const before = change?.old ?? change?.before;
      const after = change?.new ?? change?.after;

      if (!key) return "";

      return `${getDiffFieldLabel(key)} ${formatDiffValue(before)} → ${formatDiffValue(after)}`;
    })
    .filter(Boolean)
    .join(", ");
}

// ── 백업 ────────────────────────────────────────────────────────────────────
const backupList = ref([]);
const backupsLoading = ref(false);
const backupsError = ref("");
const backupMessage = ref("");
const backupRunning = ref(false);
const selectedRunId = ref("");
const selectedRun = ref(null);

const latestBackupLabel = computed(() => {
  const run = backupList.value[0];

  if (!run) return "-";

  return getBackupStatusLabel(run.status);
});

async function loadBackups() {
  if (backupsLoading.value) return;

  backupsLoading.value = true;
  backupsError.value = "";

  try {
    const data = await fetchDiscordBackups({ limit: 20 });
    backupList.value = data.runs || [];
  } catch (error) {
    backupsError.value = error?.message || "백업 이력을 불러오지 못했어요.";
  } finally {
    backupsLoading.value = false;
  }
}

async function openBackupDetail(runId) {
  if (selectedRunId.value === runId) {
    selectedRunId.value = "";
    selectedRun.value = null;

    return;
  }

  try {
    const data = await fetchDiscordBackup(runId);

    selectedRunId.value = runId;
    selectedRun.value = data.run || null;
  } catch (error) {
    alert(error?.message || "백업 상세를 불러오지 못했어요.");
  }
}

async function requestBackup() {
  if (!canBackup.value || backupRunning.value) return;

  if (!window.confirm("지금 데이터베이스 백업을 실행할까요? 완료되면 디스코드로 업로드됩니다.")) {
    return;
  }

  backupRunning.value = true;
  backupMessage.value = "";

  try {
    await runDiscordBackup();
    backupMessage.value = "백업 작업을 대기열에 넣었어요. 완료까지 잠시 걸립니다.";
    await loadBackups();
  } catch (error) {
    alert(error?.message || "백업을 시작하지 못했어요.");
  } finally {
    backupRunning.value = false;
  }
}

async function verifyRun(runId) {
  if (!canBackup.value) return;

  if (!window.confirm("이 백업을 임시 DB 로 복원해서 검증할까요? 시간이 조금 걸립니다.")) {
    return;
  }

  backupMessage.value = "";

  try {
    await verifyDiscordBackup(runId);
    backupMessage.value = "검증 작업을 대기열에 넣었어요.";
    await loadBackups();
  } catch (error) {
    alert(error?.message || "검증을 시작하지 못했어요.");
  }
}

async function downloadRun(run) {
  try {
    await downloadDiscordBackup(run.id, run.filename);
  } catch (error) {
    alert(error?.message || "백업 파일을 내려받지 못했어요.");
  }
}

// ── 스냅샷 ──────────────────────────────────────────────────────────────────
const snapshotList = ref([]);
const snapshotsLoading = ref(false);
const snapshotsError = ref("");
const snapshotMessage = ref("");
const snapshotRunning = ref(false);
const selectedSnapshotId = ref("");
const diff = ref(null);
const diffLoading = ref(false);
const diffError = ref("");

const latestSnapshotLabel = computed(() => {
  const snapshot = snapshotList.value[0];

  if (!snapshot) return "-";

  return formatDiscordDateTime(snapshot.captured_at);
});

const diffSections = computed(() => {
  const value = diff.value?.diff;

  if (!value) return [];

  const sections = [
    { key: "roles", label: "역할", data: value.roles },
    { key: "channels", label: "채널", data: value.channels },
    { key: "emojis", label: "이모지", data: value.emojis },
    { key: "stickers", label: "스티커", data: value.stickers },
    { key: "autoModeration", label: "자동 관리 규칙", data: value.autoModeration },
    { key: "scheduledEvents", label: "예약 이벤트", data: value.scheduledEvents },
  ];

  return sections
    .filter((section) => section.data && section.data.counts.added + section.data.counts.removed + section.data.counts.changed > 0)
    .map((section) => ({ ...section, ...section.data }));
});

async function loadSnapshots() {
  if (snapshotsLoading.value) return;

  snapshotsLoading.value = true;
  snapshotsError.value = "";

  try {
    const data = await fetchDiscordSnapshots({ limit: 30 });
    snapshotList.value = data.snapshots || [];
  } catch (error) {
    snapshotsError.value = error?.message || "스냅샷을 불러오지 못했어요.";
  } finally {
    snapshotsLoading.value = false;
  }
}

async function requestSnapshot() {
  if (!canManage.value || snapshotRunning.value) return;

  snapshotRunning.value = true;
  snapshotMessage.value = "";

  try {
    await createDiscordSnapshot();
    snapshotMessage.value = "현재 서버 구조를 스냅샷으로 저장했어요.";
    await loadSnapshots();
  } catch (error) {
    alert(error?.message || "스냅샷을 만들지 못했어요.");
  } finally {
    snapshotRunning.value = false;
  }
}

async function toggleSnapshotDiff(snapshotId) {
  if (selectedSnapshotId.value === snapshotId) {
    selectedSnapshotId.value = "";
    diff.value = null;

    return;
  }

  selectedSnapshotId.value = snapshotId;
  diff.value = null;
  diffError.value = "";
  diffLoading.value = true;

  try {
    diff.value = await fetchDiscordSnapshotDiff(snapshotId);
  } catch (error) {
    diffError.value = error?.message || "변경 내용을 비교하지 못했어요.";
  } finally {
    diffLoading.value = false;
  }
}

// ── 공통 ────────────────────────────────────────────────────────────────────
function formatCount(value) {
  if (value === null || value === undefined) return "-";

  return Number(value).toLocaleString("ko-KR");
}

function formatDiffValue(value) {
  if (value === null || value === undefined) return "없음";

  if (typeof value === "object") {
    const text = JSON.stringify(value);

    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }

  if (typeof value === "boolean") return value ? "예" : "아니오";

  return String(value);
}

async function loadStatus() {
  statusError.value = "";

  try {
    status.value = await fetchDiscordStatus();
  } catch (error) {
    statusError.value = error?.message || "봇 상태를 불러오지 못했어요.";
  }
}

async function loadGuild() {
  guildLoading.value = true;
  guildError.value = "";

  try {
    guild.value = await fetchDiscordGuild();
  } catch (error) {
    guild.value = null;
    guildError.value = error?.message || "서버 정보를 불러오지 못했어요.";
  } finally {
    guildLoading.value = false;
  }
}

async function refreshAll() {
  refreshing.value = true;

  try {
    await Promise.all([loadStatus(), loadGuild(), loadBackups(), loadSnapshots()]);
  } finally {
    refreshing.value = false;
  }
}

function selectTab(tab) {
  activeTab.value = tab;

  if (tab === "members" && memberList.value.length === 0) {
    loadMembers();
  }

  if (tab === "audit" && auditList.value.length === 0) {
    loadAuditLogs();
  }
}

onMounted(() => {
  refreshAll();
});
</script>

<style scoped lang="scss">
.admin-discord-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  min-height: 100%;
  color: #ffffff;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.page-header .eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
}
.page-header h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 800;
  color: #ffffff;
}
.description {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}
.summary-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
}
.summary-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.66);
}
.summary-card strong {
  font-size: 20px;
  font-weight: 800;
  color: #ffffff;
}
.tab-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tab-button {
  height: 38px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.tab-button.active {
  background: rgba(99, 102, 241, 0.24);
  color: #c7d2fe;
}
.panel {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
}
.panel-head h2,
.panel-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #ffffff;
}
.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.preset-button {
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.preset-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.link-button {
  border: none;
  background: none;
  padding: 0;
  color: #c7d2fe;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.search-input {
  height: 38px;
  min-width: 180px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}
.search-input ::placeholder {
  color: rgba(255, 255, 255, 0.4);
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}
.info-label {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.66);
}
.info-item strong {
  font-size: 14px;
  font-weight: 800;
  color: #ffffff;
  word-break: break-all;
}
.text-ok {
  color: #6ee7b7;
}
.text-bad {
  color: #fca5a5;
}
.problem-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #fca5a5;
}
.guild-card {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.guild-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  object-fit: cover;
}
.guild-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.guild-body h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.channel-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.channel-group-title {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.8);
}
.channel-list,
.overwrite-list,
.member-list,
.audit-list,
.diff-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.channel-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}
.channel-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.channel-name {
  font-size: 14px;
  font-weight: 700;
}
.overwrite-list {
  padding: 8px 0 0;
  font-size: 12px;
}
.overwrite-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.role-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 8px;
  border-radius: 50%;
}
.permission-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 520px;
  white-space: normal;
}
.permission-badge {
  font-size: 11px;
}
.member-item {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}
.member-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}
.member-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.member-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}
.audit-item {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 13px;
}
.audit-main {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.detail-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
}
.detail-box h4 {
  margin: 6px 0 0;
  font-size: 14px;
  font-weight: 800;
}
.diff-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.diff-section h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
}
.diff-list li {
  font-size: 13px;
}
.diff-added {
  color: #6ee7b7;
}
.diff-removed {
  color: #fca5a5;
}
.diff-changed {
  color: #fcd34d;
}
.table-wrap {
  overflow-x: auto;
}
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.admin-table th,
.admin-table td {
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.admin-table th {
  font-size: 12px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.05);
  white-space: nowrap;
}
.action-cell {
  display: flex;
  gap: 6px;
}
.badge-on,
.badge-off,
.badge-muted {
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
}
.badge-on {
  background: rgba(52, 211, 153, 0.18);
  color: #6ee7b7;
}
.badge-off {
  background: rgba(248, 113, 113, 0.18);
  color: #fca5a5;
}
.badge-muted {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.66);
}
.sub-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}
.mono {
  font-family: "SFMono-Regular", Consolas, monospace;
}
.notice-text {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.66);
}
.error-box {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(248, 113, 113, 0.14);
  color: #fca5a5;
  font-size: 13px;
  font-weight: 700;
}
.empty-box {
  padding: 28px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  text-align: center;
  color: rgba(255, 255, 255, 0.66);
  font-size: 14px;
}
.check-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}
</style>
