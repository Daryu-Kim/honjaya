<template>
  <div class="struct-editor">
    <div class="toolbar">
      <div class="toolbar-info">
        <span class="pill" :class="dirty ? 'warn' : 'ok'">
          {{ dirty ? "저장되지 않은 변경" : "변경 없음" }}
        </span>
        <span class="muted">{{ draftLabel }}</span>
        <span v-if="removedCount > 0" class="pill danger">
          삭제 예정 {{ removedCount }}개
        </span>
        <span class="muted">봇 역할 위치 {{ botHighestPosition }}</span>
      </div>
      <div class="toolbar-actions">
        <button
          type="button"
          class="preset-button"
          :disabled="loading"
          @click="load"
        >
          {{ loading ? "불러오는 중…" : "새로고침" }}
        </button>
        <button
          type="button"
          class="link-button danger"
          :disabled="loading || saving || !canEdit || !draft"
          @click="discardDraft"
        >
          초안 삭제
        </button>
        <button
          type="button"
          class="preset-button"
          :disabled="loading || saving || !canEdit"
          @click="resetWorking"
        >
          되돌리기
        </button>
        <button
          type="button"
          class="preset-button"
          :disabled="!dirty || saving || !canEdit"
          @click="save"
        >
          {{ saving ? "저장 중…" : "초안 저장" }}
        </button>
        <button
          type="button"
          class="preset-button"
          :disabled="loading || saving || !canEdit || !desired"
          @click="openPreset"
        >
          혼자야 기본 구조
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="loading || saving || !desired"
          @click="runPreview"
        >
          {{ previewing ? "계산 중…" : "미리보기" }}
        </button>
      </div>
    </div>

    <p v-if="loadError" class="error-box">{{ loadError }}</p>
    <p v-if="notice" class="notice-box">{{ notice }}</p>
    <p v-if="!canEdit" class="notice-box">
      구조를 편집하려면 디스코드 관리 권한(discord.manage)이 필요해요. 지금은
      읽기만 가능합니다.
    </p>

    <div class="subtab-row">
      <button
        v-for="tab in SUB_TABS"
        :key="tab.value"
        type="button"
        class="subtab-button"
        :class="{ active: subTab === tab.value }"
        @click="subTab = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- ── 역할 ────────────────────────────────────────────────────────────── -->
    <section v-if="subTab === 'roles'" class="panel">
      <div class="panel-head">
        <h3>역할 ({{ roleRows.length }}개)</h3>
        <div class="panel-actions">
          <label v-if="canEdit" class="check-all">
            <input
              type="checkbox"
              :checked="allRolesSelected"
              :disabled="selectableRoleRows.length === 0"
              @change="toggleAllRoles"
            />
            전체 선택
          </label>
          <button
            v-if="canEdit && selectedRoleIds.length > 0"
            type="button"
            class="danger-button"
            @click="removeSelectedRoles"
          >
            선택 삭제 ({{ selectedRoleIds.length }})
          </button>
          <button
            type="button"
            class="preset-button"
            :disabled="!canEdit"
            @click="addRole"
          >
            역할 추가
          </button>
        </div>
      </div>
      <p class="hint">
        높은 순서부터 표시돼요. 봇 역할보다 위로는 올릴 수 없고, 앱이 관리하는
        역할(봇 역할)은 이름·색상·순서를 바꿀 수 없습니다. 체크박스로 여러 개를
        고른 뒤 한 번에 삭제할 수 있어요.
      </p>

      <div v-for="(row, index) in roleRows" :key="row.id" class="row-card">
        <div class="row-head">
          <input
            v-if="!row.everyone && !row.managed"
            v-model="selectedRoleIds"
            type="checkbox"
            class="row-check"
            :value="row.id"
            :disabled="!canEdit"
            :aria-label="`${roleLabel(row.role)} 삭제 선택`"
          />
          <span v-else class="row-check-space"></span>
          <span class="color-dot" :style="dotStyle(row.role.color)"></span>
          <input
            v-model="row.role.name"
            type="text"
            class="name-input"
            maxlength="100"
            :disabled="!canEdit || row.managed"
          />
          <span v-if="row.everyone" class="tag">@everyone</span>
          <span v-else-if="row.managed" class="tag">앱 관리</span>
          <span v-else-if="row.temp" class="tag new">새 역할</span>
          <span class="spacer"></span>
          <button type="button" class="link-button" @click="toggleRole(row.id)">
            {{ expandedRoleId === row.id ? "닫기" : "설정" }}
          </button>
          <button
            type="button"
            class="link-button"
            :disabled="!canEdit || row.managed || index === 0"
            @click="moveRole(row, -1)"
          >
            ▲
          </button>
          <button
            type="button"
            class="link-button"
            :disabled="!canEdit || row.managed || index === roleRows.length - 1"
            @click="moveRole(row, 1)"
          >
            ▼
          </button>
          <button
            v-if="!row.everyone && !row.managed"
            type="button"
            class="link-button danger"
            @click="removeRole(row)"
          >
            삭제
          </button>
        </div>

        <div v-if="expandedRoleId === row.id" class="row-body">
          <p v-if="row.managed" class="hint">
            이 역할은 다른 앱(봇)이 관리하고 있어 수정할 수 없어요. 초안에는
            그대로 남겨 두어야 삭제 대상으로 잡히지 않습니다.
          </p>
          <template v-else>
            <div class="field-row">
              <span>색상</span>
              <input
                v-model.number="row.role.color"
                type="number"
                class="small-input"
                min="0"
                max="16777215"
                :disabled="!canEdit"
              />
              <input
                v-model="row.colorHex"
                type="text"
                class="small-input"
                placeholder="#000000"
                :disabled="!canEdit"
                @change="applyColorHex(row)"
              />
              <label class="check-inline">
                <input
                  v-model="row.role.hoist"
                  type="checkbox"
                  :disabled="!canEdit"
                />
                따로 표시
              </label>
              <label class="check-inline">
                <input
                  v-model="row.role.mentionable"
                  type="checkbox"
                  :disabled="!canEdit"
                />
                멘션 허용
              </label>
              <span>순서</span>
              <input
                v-model.number="row.role.position"
                type="number"
                class="small-input"
                min="0"
                :max="Math.max(botHighestPosition - 1, 0)"
                :disabled="!canEdit"
              />
            </div>

            <div class="perm-head">
              <strong>권한</strong>
              <input
                v-model="rolePermQuery"
                type="text"
                class="search-input"
                placeholder="권한 검색"
              />
              <span class="muted">
                {{
                  decodePermissionNames(catalog, row.role.permissions).length
                }}개 선택됨
              </span>
            </div>
            <div class="perm-list">
              <label
                v-for="perm in filteredCatalog"
                :key="perm.name"
                class="perm-item"
                :class="{ danger: perm.dangerous }"
              >
                <input
                  type="checkbox"
                  :checked="hasRolePermission(row.role, perm.name)"
                  :disabled="!canEdit"
                  @change="toggleRolePermission(row.role, perm.name, $event)"
                />
                <span>{{ perm.label }}</span>
                <code class="perm-name">{{ perm.name }}</code>
              </label>
            </div>
          </template>
        </div>
      </div>

      <div v-if="removedRoles.length > 0" class="removed-box">
        <strong>삭제 예정 역할</strong>
        <div class="chip-wrap">
          <button
            v-for="role in removedRoles"
            :key="role.id"
            type="button"
            class="chip-toggle"
            :disabled="!canEdit"
            @click="restoreRole(role)"
          >
            {{ role.name }} 복원
          </button>
        </div>
      </div>
    </section>

    <!-- ── 채널 ────────────────────────────────────────────────────────────── -->
    <section v-else-if="subTab === 'channels'" class="panel">
      <div class="panel-head">
        <h3>채널 ({{ channelRows.length }}개)</h3>
        <div class="panel-actions">
          <label v-if="canEdit" class="check-all">
            <input
              type="checkbox"
              :checked="allChannelsSelected"
              :disabled="channelRows.length === 0"
              @change="toggleAllChannels"
            />
            전체 선택
          </label>
          <button
            v-if="canEdit && selectedChannelIds.length > 0"
            type="button"
            class="danger-button"
            @click="removeSelectedChannels"
          >
            선택 삭제 ({{ selectedChannelIds.length }})
          </button>
          <button
            type="button"
            class="preset-button"
            :disabled="!canEdit"
            @click="addChannel('GuildText')"
          >
            텍스트 채널
          </button>
          <button
            type="button"
            class="preset-button"
            :disabled="!canEdit"
            @click="addChannel('GuildVoice')"
          >
            음성 채널
          </button>
          <button
            type="button"
            class="preset-button"
            :disabled="!canEdit"
            @click="addChannel('GuildCategory')"
          >
            카테고리
          </button>
        </div>
      </div>
      <p class="hint">
        스레드는 편집 대상이 아니에요(대화 기록이라 구조로 취급하지 않습니다).
        백업·로그·공지로 지정된 채널은 삭제가 막힙니다. 체크박스로 여러 개를
        고른 뒤 한 번에 삭제할 수 있어요.
      </p>

      <div v-for="group in channelGroups" :key="group.id" class="channel-group">
        <div v-if="group.category" class="row-card category-card">
          <div class="row-head">
            <input
              v-model="selectedChannelIds"
              type="checkbox"
              class="row-check"
              :value="group.category.id"
              :disabled="!canEdit"
              :aria-label="`${group.category.name} 삭제 선택`"
            />
            <span class="tag">카테고리</span>
            <input
              v-model="group.category.name"
              type="text"
              class="name-input"
              maxlength="100"
              :disabled="!canEdit"
            />
            <span class="spacer"></span>
            <button
              type="button"
              class="link-button"
              @click="toggleChannel(group.category.id)"
            >
              {{ expandedChannelId === group.category.id ? "닫기" : "설정" }}
            </button>
            <button
              type="button"
              class="link-button danger"
              :disabled="!canEdit"
              @click="removeChannel(group.category)"
            >
              삭제
            </button>
          </div>
          <div v-if="expandedChannelId === group.category.id" class="row-body">
            <div class="field-row">
              <span>순서</span>
              <input
                v-model.number="group.category.position"
                type="number"
                class="small-input"
                min="0"
                :disabled="!canEdit"
              />
            </div>
          </div>
        </div>

        <div
          v-for="channel in group.children"
          :key="channel.id"
          class="row-card"
        >
          <div class="row-head">
            <input
              v-model="selectedChannelIds"
              type="checkbox"
              class="row-check"
              :value="channel.id"
              :disabled="!canEdit"
              :aria-label="`${channel.name} 삭제 선택`"
            />
            <span class="tag">{{ getChannelTypeLabel(channel.typeName) }}</span>
            <input
              v-model="channel.name"
              type="text"
              class="name-input"
              maxlength="100"
              :disabled="!canEdit"
            />
            <span v-if="isTempId(channel.id)" class="tag new">새 채널</span>
            <span class="spacer"></span>
            <button
              type="button"
              class="link-button"
              @click="toggleChannel(channel.id)"
            >
              {{ expandedChannelId === channel.id ? "닫기" : "설정" }}
            </button>
            <button
              type="button"
              class="link-button danger"
              :disabled="!canEdit"
              @click="removeChannel(channel)"
            >
              삭제
            </button>
          </div>

          <div v-if="expandedChannelId === channel.id" class="row-body">
            <div class="field-row">
              <span>카테고리</span>
              <select v-model="channel.parentId" :disabled="!canEdit">
                <option :value="null">(없음)</option>
                <option
                  v-for="category in categoryOptions"
                  :key="category.id"
                  :value="category.id"
                  :disabled="category.id === channel.id"
                >
                  {{ category.name }}
                </option>
              </select>
              <span>순서</span>
              <input
                v-model.number="channel.position"
                type="number"
                class="small-input"
                min="0"
                :disabled="!canEdit"
              />
              <button
                v-if="isTempId(channel.id)"
                type="button"
                class="link-button"
                :disabled="!canEdit"
                @click="changeChannelType(channel)"
              >
                종류 변경 ({{ getChannelTypeLabel(channel.typeName) }})
              </button>
            </div>

            <div v-if="isTextual(channel)" class="field-row">
              <span>주제</span>
              <input
                v-model="channel.topic"
                type="text"
                maxlength="1024"
                :disabled="!canEdit"
              />
            </div>
            <div v-if="isTextual(channel)" class="field-row">
              <span>슬로우모드</span>
              <input
                v-model.number="channel.rateLimitPerUser"
                type="number"
                class="small-input"
                min="0"
                max="21600"
                :disabled="!canEdit"
              />
              <span>초</span>
              <label class="check-inline">
                <input
                  v-model="channel.nsfw"
                  type="checkbox"
                  :disabled="!canEdit"
                />
                NSFW
              </label>
            </div>
            <div v-if="isVoice(channel)" class="field-row">
              <span>비트레이트</span>
              <input
                v-model.number="channel.bitrate"
                type="number"
                class="small-input"
                min="8000"
                max="384000"
                :disabled="!canEdit"
              />
              <span>인원 제한</span>
              <input
                v-model.number="channel.userLimit"
                type="number"
                class="small-input"
                min="0"
                max="99"
                :disabled="!canEdit"
              />
            </div>

            <div class="perm-head">
              <strong>채널 권한</strong>
              <select
                v-model="overwriteTarget[channel.id]"
                :disabled="!canEdit"
              >
                <option value="">대상 선택</option>
                <option
                  v-for="role in overwriteRoleOptions"
                  :key="role.id"
                  :value="role.id"
                >
                  {{ roleLabel(role) }}
                </option>
              </select>
              <button
                type="button"
                class="link-button"
                :disabled="!canEdit || !overwriteTarget[channel.id]"
                @click="addOverwrite(channel)"
              >
                대상 추가
              </button>
            </div>

            <div class="chip-wrap">
              <button
                v-for="item in channelOverwrites(channel)"
                :key="item.overwrite.id"
                type="button"
                class="chip-toggle"
                :class="{
                  selected: selectedOverwrite[channel.id] === item.overwrite.id,
                }"
                @click="selectOverwrite(channel, item.overwrite.id)"
              >
                {{ item.label }}
              </button>
            </div>

            <div v-if="activeOverwrite(channel)" class="overwrite-panel">
              <div class="perm-head">
                <strong>{{ activeOverwrite(channel).label }}</strong>
                <input
                  v-model="permQuery"
                  type="text"
                  class="search-input"
                  placeholder="권한 검색"
                />
                <button
                  type="button"
                  class="link-button danger"
                  :disabled="!canEdit"
                  @click="
                    removeOverwrite(
                      channel,
                      activeOverwrite(channel).overwrite.id
                    )
                  "
                >
                  권한 삭제
                </button>
              </div>
              <p
                v-if="activeOverwrite(channel).overwrite.type === 1"
                class="hint"
              >
                멤버 개별 권한은 여기서 수정할 수 없어요(역할 권한만 편집 가능).
                Discord 앱에서 바꿔 주세요.
              </p>
              <div v-else class="perm-list">
                <div
                  v-for="perm in filteredCatalog"
                  :key="perm.name"
                  class="perm-item tri"
                  :class="{ danger: perm.dangerous }"
                >
                  <span>{{ perm.label }}</span>
                  <div class="tri-buttons">
                    <button
                      v-for="state in TRI_STATES"
                      :key="state.value"
                      type="button"
                      class="tri-button"
                      :class="{
                        active:
                          overwriteState(
                            activeOverwrite(channel).overwrite,
                            perm.name
                          ) === state.value,
                      }"
                      :disabled="!canEdit"
                      @click="
                        setOverwriteState(
                          activeOverwrite(channel).overwrite,
                          perm.name,
                          state.value
                        )
                      "
                    >
                      {{ state.label }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="removedChannels.length > 0" class="removed-box">
        <strong>삭제 예정 채널</strong>
        <div class="chip-wrap">
          <button
            v-for="channel in removedChannels"
            :key="channel.id"
            type="button"
            class="chip-toggle"
            :disabled="!canEdit"
            @click="restoreChannel(channel)"
          >
            {{ channel.name }} 복원
          </button>
        </div>
      </div>
    </section>

    <!-- ── 서버 설정 ───────────────────────────────────────────────────────── -->
    <section v-else-if="subTab === 'settings'" class="panel">
      <div class="panel-head">
        <h3>서버 설정</h3>
      </div>
      <p class="hint">
        여기서 바꾼 값도 초안에 담겨 미리보기·적용을 거쳐 Discord 에 반영됩니다.
      </p>
      <div class="field-row">
        <span>서버 이름</span>
        <input
          v-model="guildDraft.name"
          type="text"
          maxlength="100"
          :disabled="!canEdit"
        />
      </div>
      <div class="field-row">
        <span>인증 레벨</span>
        <select
          v-model.number="guildDraft.verificationLevel"
          :disabled="!canEdit"
        >
          <option :value="0">없음</option>
          <option :value="1">낮음</option>
          <option :value="2">보통</option>
          <option :value="3">높음</option>
          <option :value="4">매우 높음</option>
        </select>
      </div>
      <div class="field-row">
        <span>유해 콘텐츠</span>
        <select
          v-model.number="guildDraft.explicitContentFilter"
          :disabled="!canEdit"
        >
          <option :value="0">사용 안 함</option>
          <option :value="1">역할 없는 멤버</option>
          <option :value="2">모든 멤버</option>
        </select>
      </div>
      <div class="field-row">
        <span>기본 알림</span>
        <select
          v-model.number="guildDraft.defaultMessageNotifications"
          :disabled="!canEdit"
        >
          <option :value="0">모든 메시지</option>
          <option :value="1">멘션만</option>
        </select>
      </div>
      <div class="field-row">
        <span>AFK 채널</span>
        <select v-model="guildDraft.afkChannelId" :disabled="!canEdit">
          <option :value="null">(없음)</option>
          <option
            v-for="channel in voiceChannels"
            :key="channel.id"
            :value="channel.id"
          >
            {{ channel.name }}
          </option>
        </select>
        <span>AFK 시간</span>
        <select v-model.number="guildDraft.afkTimeout" :disabled="!canEdit">
          <option :value="60">1분</option>
          <option :value="300">5분</option>
          <option :value="900">15분</option>
          <option :value="1800">30분</option>
          <option :value="3600">1시간</option>
        </select>
      </div>
      <div class="field-row">
        <span>시스템 채널</span>
        <select v-model="guildDraft.systemChannelId" :disabled="!canEdit">
          <option :value="null">(없음)</option>
          <option
            v-for="channel in textChannels"
            :key="channel.id"
            :value="channel.id"
          >
            {{ channel.name }}
          </option>
        </select>
      </div>
    </section>

    <!-- ── 미리보기 ────────────────────────────────────────────────────────── -->
    <section v-else-if="subTab === 'preview'" class="panel">
      <div class="panel-head">
        <h3>미리보기</h3>
        <div class="panel-actions">
          <button
            type="button"
            class="primary-button"
            :disabled="
              previewing ||
              !planLoaded ||
              plan.ops.length === 0 ||
              plan.blocked.length > 0 ||
              !canEdit
            "
            @click="openApplyDialog"
          >
            적용
          </button>
        </div>
      </div>

      <p v-if="!planLoaded" class="empty-box">
        위쪽 "미리보기" 버튼을 누르면 실제로 바뀔 작업 목록을 계산해요.
      </p>
      <template v-else>
        <div class="count-row">
          <span class="count-badge">전체 {{ plan.counts.total }}</span>
          <span class="count-badge">생성 {{ plan.counts.create }}</span>
          <span class="count-badge">수정 {{ plan.counts.update }}</span>
          <span class="count-badge">이동 {{ plan.counts.move }}</span>
          <span class="count-badge danger"
            >삭제 {{ plan.counts.destructive }}</span
          >
        </div>

        <div v-if="plan.blocked.length > 0" class="issue-box bad">
          <strong
            >막힌 항목 {{ plan.blocked.length }}개 — 적용할 수 없어요</strong
          >
          <ul>
            <li v-for="(item, index) in plan.blocked" :key="`b${index}`">
              [{{ getBlockedReasonLabel(item.code) }}] {{ item.message }}
            </li>
          </ul>
        </div>
        <div v-if="plan.warnings.length > 0" class="issue-box warn">
          <strong>주의 {{ plan.warnings.length }}개</strong>
          <ul>
            <li v-for="(item, index) in plan.warnings" :key="`w${index}`">
              {{ item.message }}
            </li>
          </ul>
        </div>
        <div v-if="plan.conflicts.length > 0" class="issue-box warn">
          <strong
            >Discord 에서 직접 바뀐 항목 {{ plan.conflicts.length }}개</strong
          >
          <ul>
            <li v-for="(item, index) in plan.conflicts" :key="`c${index}`">
              {{ item.message }}
            </li>
          </ul>
        </div>

        <table v-if="plan.ops.length > 0" class="op-table">
          <thead>
            <tr>
              <th>#</th>
              <th>단계</th>
              <th>작업</th>
              <th>대상</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="op in plan.ops"
              :key="op.seq"
              :class="{ destructive: op.destructive }"
            >
              <td>{{ op.seq }}</td>
              <td>{{ STRUCT_PHASE_LABELS[op.phase] || op.phase }}</td>
              <td>{{ op.label }}</td>
              <td class="mono">{{ op.targetId || "-" }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-box">
          바뀔 내용이 없어요. 초안과 현재 Discord 상태가 같습니다.
        </p>
      </template>
    </section>

    <!-- ── 적용 이력 ───────────────────────────────────────────────────────── -->
    <section v-else class="panel">
      <div class="panel-head">
        <h3>적용 이력</h3>
        <div class="panel-actions">
          <button type="button" class="preset-button" @click="loadRuns">
            새로고침
          </button>
        </div>
      </div>
      <p v-if="runsError" class="error-box">{{ runsError }}</p>
      <p v-if="runs.length === 0" class="empty-box">
        아직 적용한 기록이 없어요.
      </p>
      <table v-else class="op-table">
        <thead>
          <tr>
            <th>시각</th>
            <th>상태</th>
            <th>성공/전체</th>
            <th>실행자</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="run in runs" :key="run.id">
            <td>
              {{ formatDiscordDateTime(run.started_at || run.created_at) }}
            </td>
            <td>
              <span class="pill" :class="runStatusClass(run.status)">
                {{ getApplyStatusLabel(run.status) }}
              </span>
              <span v-if="run.rollback_of" class="muted"> · 되돌리기</span>
            </td>
            <td>{{ run.op_ok }} / {{ run.op_total }}</td>
            <td>{{ run.created_by || "-" }}</td>
            <td>
              <button
                type="button"
                class="link-button"
                @click="toggleRun(run.id)"
              >
                {{ openRunId === run.id ? "닫기" : "상세" }}
              </button>
              <button
                type="button"
                class="link-button danger"
                :disabled="
                  !canEdit ||
                  Boolean(run.rollback_of) ||
                  run.status === 'RUNNING'
                "
                @click="openRollbackDialog(run)"
              >
                롤백
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="openRun" class="row-body">
        <p v-if="openRun.run?.error" class="error-box">
          {{ openRun.run.error }}
        </p>
        <table class="op-table">
          <thead>
            <tr>
              <th>#</th>
              <th>작업</th>
              <th>상태</th>
              <th>HTTP</th>
              <th>오류</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="op in openRun.ops || []" :key="op.id">
              <td>{{ op.seq }}</td>
              <td>{{ getStructOpLabel(op.op) }}</td>
              <td>{{ getApplyOpStatusLabel(op.status) }}</td>
              <td>{{ op.http_status || "-" }}</td>
              <td class="error-cell">{{ op.error || "-" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 적용 확인 -->
    <div v-if="applyDialog" class="modal-backdrop">
      <div class="modal">
        <h3>구조 적용</h3>
        <p class="hint">
          적용하면 Discord 서버의 역할·채널이 바로 바뀝니다. 적용 전 스냅샷을
          자동으로 남기고, 중간에 실패하면 그 자리에서 멈춥니다.
        </p>
        <div class="count-row">
          <span class="count-badge">작업 {{ plan.counts.total }}개</span>
          <span class="count-badge danger">
            삭제 {{ plan.counts.destructive }}개
          </span>
        </div>
        <label
          v-if="plan.requiresAdministratorConfirm"
          class="check-inline warn"
        >
          <input v-model="applyForm.allowAdministrator" type="checkbox" />
          Administrator 권한이 포함된 변경에 동의합니다
        </label>
        <label v-if="plan.dangerousOverwrite" class="check-inline warn">
          <input v-model="applyForm.allowDangerous" type="checkbox" />
          위험한 채널 권한 변경에 동의합니다
        </label>
        <label v-if="plan.requiresDeleteConfirm" class="check-inline warn">
          <input v-model="applyForm.allowDeletes" type="checkbox" />
          {{ plan.counts.destructive }}개 삭제에 동의합니다
        </label>
        <div class="field-row">
          <span>확인</span>
          <input
            v-model="applyForm.confirmName"
            type="text"
            :placeholder="`서버 이름(${guild?.name || '-'})을 그대로 입력`"
          />
        </div>
        <p v-if="applyError" class="error-box">{{ applyError }}</p>
        <div class="modal-actions">
          <button type="button" class="preset-button" @click="closeApplyDialog">
            취소
          </button>
          <button
            type="button"
            class="danger-button"
            :disabled="applying || !applyFormReady"
            @click="submitApply"
          >
            {{ applying ? "적용 중…" : "적용" }}
          </button>
        </div>
      </div>
    </div>

    <!-- 혼자야 기본 구조 프리셋 -->
    <div v-if="presetDialog" class="modal-backdrop">
      <div class="modal">
        <h3>혼자야 기본 구조</h3>
        <p class="hint">
          우리 가게에 맞는 역할·카테고리·채널을 초안에 채워 넣습니다. 이미 있는
          항목은 이름으로 찾아 그대로 두고, 없는 것만 새로 만듭니다(삭제·이름
          변경 없음). 확인을 누르면 미리보기로 넘어갑니다.
        </p>

        <div v-if="presetSummary" class="preset-summary">
          <div class="preset-block">
            <strong>역할</strong>
            <p v-if="presetSummary.createdRoles.length">
              새로 만들 역할: {{ presetSummary.createdRoles.join(", ") }}
            </p>
            <p v-else>새로 만들 역할이 없습니다.</p>
            <p v-if="presetSummary.reusedRoles.length" class="muted">
              이미 있어서 그대로 두는 역할:
              {{ presetSummary.reusedRoles.join(", ") }}
            </p>
          </div>

          <div class="preset-block">
            <strong>카테고리</strong>
            <p v-if="presetSummary.createdCategories.length">
              새로 만들 카테고리:
              {{ presetSummary.createdCategories.join(", ") }}
            </p>
            <p v-else>새로 만들 카테고리가 없습니다.</p>
          </div>

          <div class="preset-block">
            <strong>채널</strong>
            <p v-if="presetSummary.createdChannels.length">
              새로 만들 채널 {{ presetSummary.createdChannels.length }}개:
              {{ presetSummary.createdChannels.join(", ") }}
            </p>
            <p v-else>새로 만들 채널이 없습니다.</p>
          </div>

          <p v-if="presetSummary.missingPermissions.length" class="hint warn">
            권한 목록에서 찾지 못한 항목이 있어요:
            {{ presetSummary.missingPermissions.join(", ") }}
          </p>
        </div>

        <p class="hint">
          기존 역할·채널의 권한은 건드리지 않습니다. 실제 반영은 미리보기를
          확인하고 ‘적용’을 눌렀을 때만 이뤄집니다.
        </p>

        <div class="modal-actions">
          <button
            type="button"
            class="preset-button"
            @click="presetDialog = false"
          >
            취소
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="previewing"
            @click="applyPreset"
          >
            확인 후 미리보기
          </button>
        </div>
      </div>
    </div>

    <!-- 롤백 확인 -->
    <div v-if="rollbackDialog" class="modal-backdrop">
      <div class="modal">
        <h3>롤백</h3>
        <p class="hint">
          이 실행을 되돌립니다. 그 사이 Discord 에서 직접 바꾼 내용은 사라질 수
          있어요. 삭제했던 채널·역할은 새 ID 로 다시 만들어지므로 멤버 역할
          지정은 복구되지 않습니다.
        </p>
        <div class="field-row">
          <span>확인</span>
          <input
            v-model="rollbackForm.confirmName"
            type="text"
            placeholder="서버 이름을 그대로 입력"
          />
        </div>
        <p v-if="rollbackError" class="error-box">{{ rollbackError }}</p>
        <div class="modal-actions">
          <button
            type="button"
            class="preset-button"
            @click="closeRollbackDialog"
          >
            취소
          </button>
          <button
            type="button"
            class="danger-button"
            :disabled="rollingBack || !rollbackForm.confirmName.trim()"
            @click="submitRollback"
          >
            {{ rollingBack ? "되돌리는 중…" : "롤백" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import {
  STRUCT_PHASE_LABELS,
  applyDiscordStructure,
  buildHonjayaPreset,
  clearDiscordDraft,
  decodePermissionNames,
  desiredFromStructure,
  encodePermissionNames,
  fetchDiscordApplyRun,
  fetchDiscordApplyRuns,
  fetchDiscordStructure,
  formatDiscordDateTime,
  getApplyOpStatusLabel,
  getApplyStatusLabel,
  getBlockedReasonLabel,
  getChannelTypeLabel,
  getStructOpLabel,
  isTempId,
  newTempId,
  previewDiscordApply,
  rollbackDiscordApply,
  saveDiscordDraft,
} from "@/lib/discord";
import { hasPermission } from "@/lib/staffAuth";

const SUB_TABS = [
  { value: "roles", label: "역할" },
  { value: "channels", label: "채널" },
  { value: "settings", label: "서버 설정" },
  { value: "preview", label: "미리보기" },
  { value: "history", label: "적용 이력" },
];

const TRI_STATES = [
  { value: "inherit", label: "상속" },
  { value: "allow", label: "허용" },
  { value: "deny", label: "거부" },
];

// 서버(discordApply.js)의 TEXTUAL_TYPES / VOICE_TYPES 와 같은 목록입니다.
const TEXTUAL_TYPES = [
  "GuildText",
  "GuildAnnouncement",
  "GuildForum",
  "GuildMedia",
];
const VOICE_TYPES = ["GuildVoice", "GuildStageVoice"];

function emptyCounts() {
  return { total: 0, destructive: 0, create: 0, update: 0, move: 0, remove: 0 };
}

function emptyPlan() {
  return {
    ops: [],
    blocked: [],
    warnings: [],
    conflicts: [],
    counts: emptyCounts(),
    requiresAdministratorConfirm: false,
    dangerousOverwrite: false,
    requiresDeleteConfirm: false,
  };
}

const canEdit = computed(() => hasPermission("discord.manage"));

const subTab = ref("roles");
const loading = ref(false);
const saving = ref(false);
const previewing = ref(false);
const loadError = ref("");
const notice = ref("");

const structure = ref(null);
const guild = computed(() => structure.value?.guild || null);
const bot = ref(null);
const catalog = ref([]);
const draft = ref(null);

const desired = ref(null);
const baselineJson = ref("");
const removedRoles = ref([]);
const removedChannels = ref([]);

// 여러 개 선택 삭제용. 행 id 를 그대로 담습니다(새 행은 임시 id).
const selectedRoleIds = ref([]);
const selectedChannelIds = ref([]);

const expandedRoleId = ref("");
const expandedChannelId = ref("");
const rolePermQuery = ref("");
const permQuery = ref("");
const overwriteTarget = ref({});
const selectedOverwrite = ref({});

const plan = ref(emptyPlan());
const planLoaded = ref(false);

const runs = ref([]);
const runsError = ref("");
const openRunId = ref("");
const openRun = ref(null);

const applyDialog = ref(false);
const applying = ref(false);
const applyError = ref("");
const applyForm = ref({
  confirmName: "",
  allowAdministrator: false,
  allowDangerous: false,
  allowDeletes: false,
});

const rollbackDialog = ref(false);
const rollingBack = ref(false);
const rollbackError = ref("");
const rollbackTarget = ref(null);
const rollbackForm = ref({ confirmName: "" });

const presetDialog = ref(false);
const presetResult = ref(null);

const botHighestPosition = computed(() => {
  const value = Number(bot.value?.highestPosition);

  return Number.isFinite(value) ? value : -1;
});

// ── 초안 다루기 ──────────────────────────────────────────────────────────────

function cloneRole(role) {
  return {
    id: role.id,
    name: role.name ?? "",
    color: Number(role.color) || 0,
    hoist: Boolean(role.hoist),
    mentionable: Boolean(role.mentionable),
    permissions: String(role.permissions ?? "0"),
    position: Number(role.position) || 0,
  };
}

function cloneChannel(channel) {
  const keepNullable = (value) => (value === undefined ? null : value);

  return {
    id: channel.id,
    typeName: String(channel.typeName ?? "GuildText"),
    name: String(channel.name ?? ""),
    parentId: channel.parentId ?? null,
    position: Number(channel.position) || 0,
    topic: keepNullable(channel.topic),
    nsfw:
      channel.nsfw === null || channel.nsfw === undefined
        ? null
        : Boolean(channel.nsfw),
    rateLimitPerUser: keepNullable(channel.rateLimitPerUser),
    bitrate: keepNullable(channel.bitrate),
    userLimit: keepNullable(channel.userLimit),
    permissionOverwrites: (channel.permissionOverwrites || []).map((item) => ({
      id: item.id,
      type: Number(item.type) === 1 ? 1 : 0,
      allow: String(item.allow ?? "0"),
      deny: String(item.deny ?? "0"),
    })),
  };
}

function payloadDesired() {
  if (!desired.value) {
    return null;
  }

  return {
    guild: { ...(desired.value.guild || {}) },
    roles: desired.value.roles.map(cloneRole),
    channels: desired.value.channels.map(cloneChannel),
  };
}

const dirty = computed(() => {
  if (!desired.value) {
    return false;
  }

  return JSON.stringify(payloadDesired()) !== baselineJson.value;
});

const removedCount = computed(
  () => removedRoles.value.length + removedChannels.value.length
);

const draftLabel = computed(() => {
  if (!draft.value) {
    return "저장된 초안 없음 (현재 Discord 상태 기준)";
  }

  const at = draft.value.updatedAt || draft.value.updated_at || "";

  return `초안 v${draft.value.version}${
    at ? ` · ${formatDiscordDateTime(at)}` : ""
  }`;
});

async function load() {
  loading.value = true;
  loadError.value = "";
  notice.value = "";

  try {
    const payload = await fetchDiscordStructure();

    structure.value = payload?.structure || null;
    bot.value = payload?.bot || null;
    catalog.value = Array.isArray(payload?.permissions)
      ? payload.permissions
      : [];
    draft.value = payload?.draft || null;

    if (!structure.value) {
      loadError.value =
        "봇이 서버 구조를 보내지 않았어요. 봇 연결 상태를 확인해 주세요.";
    }

    resetWorking();
  } catch (error) {
    loadError.value = error?.message || "구조를 불러오지 못했어요.";
  } finally {
    loading.value = false;
  }
}

function resetWorking() {
  removedRoles.value = [];
  removedChannels.value = [];
  selectedRoleIds.value = [];
  selectedChannelIds.value = [];
  expandedRoleId.value = "";
  expandedChannelId.value = "";
  overwriteTarget.value = {};
  selectedOverwrite.value = {};
  plan.value = emptyPlan();
  planLoaded.value = false;

  if (draft.value?.desired) {
    // 저장된 초안이 있으면 그걸 이어서 편집합니다. 라이브와 어긋난 항목은
    // 미리보기의 "직접 바뀐 항목" 경고로 드러납니다.
    desired.value = {
      guild: { ...(draft.value.desired.guild || {}) },
      roles: (draft.value.desired.roles || []).map(cloneRole),
      channels: (draft.value.desired.channels || []).map(cloneChannel),
    };
  } else {
    desired.value = desiredFromStructure(structure.value);
  }

  baselineJson.value = JSON.stringify(payloadDesired());
}

async function save() {
  const payload = payloadDesired();

  if (!payload) {
    return;
  }

  saving.value = true;
  loadError.value = "";
  notice.value = "";

  try {
    const saved = await saveDiscordDraft(payload);
    draft.value = saved?.draft || null;
    baselineJson.value = JSON.stringify(payload);
    notice.value = "초안을 저장했어요. 미리보기로 실제 변경을 확인하세요.";
  } catch (error) {
    loadError.value = error?.message || "초안을 저장하지 못했어요.";
  } finally {
    saving.value = false;
  }
}

async function discardDraft() {
  loadError.value = "";

  try {
    await clearDiscordDraft();
    draft.value = null;
    resetWorking();
    notice.value =
      "저장된 초안을 지웠어요. 현재 Discord 상태를 기준으로 다시 시작합니다.";
  } catch (error) {
    loadError.value = error?.message || "초안을 지우지 못했어요.";
  }
}

// ── 역할 ────────────────────────────────────────────────────────────────────

const roleRows = computed(() => {
  const rows = (desired.value?.roles || []).map((role) => {
    const live = (structure.value?.roles || []).find(
      (item) => String(item.id) === String(role.id)
    );

    return {
      id: role.id,
      role,
      everyone: String(role.id) === String(guild.value?.id),
      managed: Boolean(live?.managed),
      temp: isTempId(role.id),
      colorHex: role.color
        ? `#${Number(role.color).toString(16).padStart(6, "0")}`
        : "",
    };
  });

  return rows.sort((a, b) => Number(b.role.position) - Number(a.role.position));
});

function dotStyle(color) {
  const value = Number(color) || 0;

  return {
    backgroundColor: value ? `#${value.toString(16).padStart(6, "0")}` : "",
  };
}

function roleLabel(role) {
  if (String(role.id) === String(guild.value?.id)) {
    return "@everyone";
  }

  return role.name || role.id;
}

function toggleRole(id) {
  expandedRoleId.value = expandedRoleId.value === id ? "" : id;
}

function applyColorHex(row) {
  const text = String(row.colorHex || "")
    .replace("#", "")
    .trim();

  if (!/^[0-9a-fA-F]{1,6}$/.test(text)) {
    row.colorHex = row.role.color
      ? `#${Number(row.role.color).toString(16).padStart(6, "0")}`
      : "#000000";

    return;
  }

  row.role.color = parseInt(text, 16);
}

const filteredCatalog = computed(() => {
  const raw = subTab.value === "roles" ? rolePermQuery.value : permQuery.value;
  const term = String(raw || "")
    .trim()
    .toLowerCase();

  if (!term) {
    return catalog.value;
  }

  return catalog.value.filter(
    (perm) =>
      String(perm.label || "")
        .toLowerCase()
        .includes(term) ||
      String(perm.name || "")
        .toLowerCase()
        .includes(term)
  );
});

function hasRolePermission(role, name) {
  return decodePermissionNames(catalog.value, role.permissions).includes(name);
}

function toggleRolePermission(role, name, event) {
  const names = new Set(decodePermissionNames(catalog.value, role.permissions));

  if (event.target.checked) {
    names.add(name);
  } else {
    names.delete(name);
  }

  role.permissions = encodePermissionNames(catalog.value, [...names]);
}

function addRole() {
  desired.value.roles.push({
    id: newTempId("role"),
    name: "새 역할",
    color: 0,
    hoist: false,
    mentionable: false,
    permissions: "0",
    position: Math.max(Math.min(1, botHighestPosition.value - 1), 0),
  });

  notice.value = "역할을 추가했어요. 이름과 권한을 정한 뒤 초안을 저장하세요.";
}

function removeRole(row) {
  const index = desired.value.roles.findIndex((role) => role.id === row.id);

  if (index < 0) {
    return;
  }

  const [role] = desired.value.roles.splice(index, 1);
  selectedRoleIds.value = selectedRoleIds.value.filter((id) => id !== role.id);

  // 새로 만든 역할은 Discord 에 없으니 "삭제 예정"에 넣지 않습니다.
  if (!isTempId(role.id)) {
    removedRoles.value.push(role);
  }
}

function restoreRole(role) {
  desired.value.roles.push(role);
  removedRoles.value = removedRoles.value.filter((item) => item.id !== role.id);
}

// 삭제할 수 있는 역할만 체크박스를 답니다(@everyone 과 봇 관리 역할 제외).
const selectableRoleRows = computed(() =>
  roleRows.value.filter((row) => !row.everyone && !row.managed)
);

const allRolesSelected = computed(
  () =>
    selectableRoleRows.value.length > 0 &&
    selectedRoleIds.value.length === selectableRoleRows.value.length
);

function toggleAllRoles() {
  selectedRoleIds.value = allRolesSelected.value
    ? []
    : selectableRoleRows.value.map((row) => row.id);
}

function removeSelectedRoles() {
  const rows = roleRows.value.filter((row) =>
    selectedRoleIds.value.includes(row.id)
  );

  if (rows.length === 0) {
    return;
  }

  rows.forEach((row) => removeRole(row));
  selectedRoleIds.value = [];
  notice.value = `역할 ${rows.length}개를 삭제 예정으로 표시했어요. 초안을 저장한 뒤 미리보기로 확인하세요.`;
}

// 위/아래로 옮길 때는 position 값을 맞바꿉니다. 서버는 position 오름차순으로
// roles:position 을 실행하므로 값 교체만으로 안전하게 순서가 바뀝니다.
function moveRole(row, direction) {
  const list = roleRows.value;
  const index = list.findIndex((item) => item.id === row.id);
  const neighbor = list[index + direction];

  if (index < 0 || !neighbor || neighbor.managed || row.managed) {
    return;
  }

  const position = Number(row.role.position);

  row.role.position = Number(neighbor.role.position);
  neighbor.role.position = position;
}

// ── 채널 ────────────────────────────────────────────────────────────────────

const channelRows = computed(() => desired.value?.channels || []);

const categoryOptions = computed(() =>
  channelRows.value
    .filter((channel) => channel.typeName === "GuildCategory")
    .slice()
    .sort(
      (a, b) =>
        Number(a.position) - Number(b.position) || a.name.localeCompare(b.name)
    )
);

const voiceChannels = computed(() =>
  channelRows.value.filter((channel) => VOICE_TYPES.includes(channel.typeName))
);

const textChannels = computed(() =>
  channelRows.value.filter((channel) =>
    TEXTUAL_TYPES.includes(channel.typeName)
  )
);

const channelGroups = computed(() => {
  const categories = categoryOptions.value;
  const groups = categories.map((category) => ({
    id: category.id,
    category,
    children: channelRows.value
      .filter((channel) => channel.parentId === category.id)
      .sort(
        (a, b) =>
          Number(a.position) - Number(b.position) ||
          a.name.localeCompare(b.name)
      ),
  }));

  const categoryIds = new Set(categories.map((category) => category.id));
  const loose = channelRows.value
    .filter(
      (channel) =>
        channel.typeName !== "GuildCategory" &&
        !categoryIds.has(channel.parentId)
    )
    .sort(
      (a, b) =>
        Number(a.position) - Number(b.position) || a.name.localeCompare(b.name)
    );

  if (loose.length > 0) {
    groups.push({ id: "__loose", category: null, children: loose });
  }

  return groups;
});

function isTextual(channel) {
  return TEXTUAL_TYPES.includes(channel.typeName);
}

function isVoice(channel) {
  return VOICE_TYPES.includes(channel.typeName);
}

function toggleChannel(id) {
  expandedChannelId.value = expandedChannelId.value === id ? "" : id;
}

function addChannel(typeName) {
  const isText = TEXTUAL_TYPES.includes(typeName);
  const isVoiceType = VOICE_TYPES.includes(typeName);
  const channel = {
    id: newTempId("channel"),
    typeName,
    name: typeName === "GuildCategory" ? "새 카테고리" : "새 채널",
    parentId: null,
    position: 0,
    topic: isText ? "" : null,
    nsfw: isText ? false : null,
    rateLimitPerUser: isText ? 0 : null,
    bitrate: isVoiceType ? 64000 : null,
    userLimit: isVoiceType ? 0 : null,
    permissionOverwrites: [],
  };

  desired.value.channels.push(channel);
  expandedChannelId.value = channel.id;
}

// 새 채널만 종류를 바꿀 수 있습니다(기존 채널 종류 변경은 Discord 도 막습니다).
function changeChannelType(channel) {
  const order = [
    "GuildText",
    "GuildVoice",
    "GuildCategory",
    "GuildAnnouncement",
    "GuildForum",
    "GuildMedia",
  ];
  const next = order[(order.indexOf(channel.typeName) + 1) % order.length];

  channel.typeName = next;
  channel.topic = isTextual(channel) ? channel.topic ?? "" : null;
  channel.nsfw = isTextual(channel) ? channel.nsfw ?? false : null;
  channel.rateLimitPerUser = isTextual(channel)
    ? channel.rateLimitPerUser ?? 0
    : null;
  channel.bitrate = isVoice(channel) ? channel.bitrate ?? 64000 : null;
  channel.userLimit = isVoice(channel) ? channel.userLimit ?? 0 : null;
}

function removeChannel(channel) {
  const index = desired.value.channels.findIndex(
    (item) => item.id === channel.id
  );

  if (index < 0) {
    return;
  }

  const [removed] = desired.value.channels.splice(index, 1);
  selectedChannelIds.value = selectedChannelIds.value.filter(
    (id) => id !== removed.id
  );

  if (!isTempId(removed.id)) {
    removedChannels.value.push(removed);
  }
}

function restoreChannel(channel) {
  desired.value.channels.push(channel);
  removedChannels.value = removedChannels.value.filter(
    (item) => item.id !== channel.id
  );
}

const allChannelsSelected = computed(
  () =>
    channelRows.value.length > 0 &&
    selectedChannelIds.value.length === channelRows.value.length
);

function toggleAllChannels() {
  selectedChannelIds.value = allChannelsSelected.value
    ? []
    : channelRows.value.map((channel) => channel.id);
}

function removeSelectedChannels() {
  const channels = channelRows.value.filter((channel) =>
    selectedChannelIds.value.includes(channel.id)
  );

  if (channels.length === 0) {
    return;
  }

  channels.forEach((channel) => removeChannel(channel));
  selectedChannelIds.value = [];
  notice.value = `채널 ${channels.length}개를 삭제 예정으로 표시했어요. 초안을 저장한 뒤 미리보기로 확인하세요.`;
}

// ── 채널 권한 덮어쓰기 ──────────────────────────────────────────────────────

const overwriteRoleOptions = computed(() =>
  roleRows.value.map((row) => row.role)
);

function channelOverwrites(channel) {
  return (channel.permissionOverwrites || []).map((overwrite) => {
    if (Number(overwrite.type) === 1) {
      return { overwrite, label: `멤버 ${overwrite.id}` };
    }

    const role = (desired.value?.roles || []).find(
      (item) => String(item.id) === String(overwrite.id)
    );

    return {
      overwrite,
      label: role ? roleLabel(role) : `알 수 없는 역할 ${overwrite.id}`,
    };
  });
}

function selectOverwrite(channel, overwriteId) {
  selectedOverwrite.value = {
    ...selectedOverwrite.value,
    [channel.id]:
      selectedOverwrite.value[channel.id] === overwriteId ? "" : overwriteId,
  };
}

function activeOverwrite(channel) {
  const id = selectedOverwrite.value[channel.id];

  if (!id) {
    return null;
  }

  return (
    channelOverwrites(channel).find((item) => item.overwrite.id === id) || null
  );
}

function addOverwrite(channel) {
  const targetId = overwriteTarget.value[channel.id];

  if (!targetId) {
    return;
  }

  if (
    (channel.permissionOverwrites || []).some((item) => item.id === targetId)
  ) {
    notice.value = "이미 권한이 설정된 대상이에요.";

    return;
  }

  channel.permissionOverwrites = [
    ...(channel.permissionOverwrites || []),
    { id: targetId, type: 0, allow: "0", deny: "0" },
  ];
  selectedOverwrite.value = {
    ...selectedOverwrite.value,
    [channel.id]: targetId,
  };
}

function removeOverwrite(channel, overwriteId) {
  channel.permissionOverwrites = (channel.permissionOverwrites || []).filter(
    (item) => item.id !== overwriteId
  );
  selectedOverwrite.value = { ...selectedOverwrite.value, [channel.id]: "" };
}

function permBit(name) {
  const perm = catalog.value.find((item) => item.name === name);

  return perm ? BigInt(perm.bit) : 0n;
}

function overwriteState(overwrite, name) {
  const bit = permBit(name);

  if ((BigInt(overwrite.allow || "0") & bit) !== 0n) {
    return "allow";
  }

  if ((BigInt(overwrite.deny || "0") & bit) !== 0n) {
    return "deny";
  }

  return "inherit";
}

function setOverwriteState(overwrite, name, state) {
  const bit = permBit(name);
  let allow = BigInt(overwrite.allow || "0");
  let deny = BigInt(overwrite.deny || "0");

  allow &= ~bit;
  deny &= ~bit;

  if (state === "allow") {
    allow |= bit;
  } else if (state === "deny") {
    deny |= bit;
  }

  overwrite.allow = allow.toString();
  overwrite.deny = deny.toString();
}

// ── 서버 설정 ───────────────────────────────────────────────────────────────

const guildDraft = computed(() => desired.value?.guild || {});

// ── 혼자야 기본 구조 프리셋 ─────────────────────────────────────────────────

const presetSummary = computed(() => presetResult.value?.summary || null);

function openPreset() {
  if (!catalog.value.length) {
    notice.value =
      "권한 목록을 불러오지 못해 기본 구조를 만들 수 없어요. 새로고침 후 다시 시도해 주세요.";

    return;
  }

  const result = buildHonjayaPreset({
    desired: payloadDesired(),
    catalog: catalog.value,
    everyoneRoleId: guild.value?.id || "",
    botHighestPosition: botHighestPosition.value,
  });

  if (!result) {
    notice.value = "초안을 읽지 못해 기본 구조를 만들 수 없어요.";

    return;
  }

  presetResult.value = result;
  presetDialog.value = true;
}

async function applyPreset() {
  const result = presetResult.value;

  if (!result) {
    return;
  }

  const { summary } = result;

  desired.value = result.desired;
  presetDialog.value = false;
  presetResult.value = null;

  await runPreview();

  if (planLoaded.value) {
    notice.value = `혼자야 기본 구조를 초안에 채웠어요 · 역할 ${summary.createdRoles.length}개 · 카테고리 ${summary.createdCategories.length}개 · 채널 ${summary.createdChannels.length}개 추가. 미리보기를 확인한 뒤 적용하세요.`;
  }
}

// ── 미리보기 / 적용 ─────────────────────────────────────────────────────────

async function runPreview() {
  const payload = payloadDesired();

  if (!payload) {
    return;
  }

  previewing.value = true;
  loadError.value = "";
  notice.value = "";
  subTab.value = "preview";

  try {
    const result = await previewDiscordApply(payload);

    plan.value = {
      ...emptyPlan(),
      ops: result?.ops || [],
      blocked: result?.blocked || [],
      warnings: result?.warnings || [],
      conflicts: result?.conflicts || [],
      counts: result?.counts || emptyCounts(),
      requiresAdministratorConfirm: Boolean(
        result?.requiresAdministratorConfirm
      ),
      dangerousOverwrite: Boolean(result?.dangerousOverwrite),
      requiresDeleteConfirm: Boolean(result?.requiresDeleteConfirm),
    };
    planLoaded.value = true;
  } catch (error) {
    plan.value = emptyPlan();
    planLoaded.value = false;
    loadError.value = error?.message || "미리보기를 계산하지 못했어요.";
  } finally {
    previewing.value = false;
  }
}

const applyFormReady = computed(() => {
  const typed = String(applyForm.value.confirmName || "").trim();

  if (!typed || typed !== String(guild.value?.name || "").trim()) {
    return false;
  }

  if (
    plan.value.requiresAdministratorConfirm &&
    !applyForm.value.allowAdministrator
  ) {
    return false;
  }

  if (plan.value.dangerousOverwrite && !applyForm.value.allowDangerous) {
    return false;
  }

  if (plan.value.requiresDeleteConfirm && !applyForm.value.allowDeletes) {
    return false;
  }

  return true;
});

function openApplyDialog() {
  applyError.value = "";
  applyForm.value = {
    confirmName: "",
    allowAdministrator: false,
    allowDangerous: false,
    allowDeletes: false,
  };
  applyDialog.value = true;
}

function closeApplyDialog() {
  applyDialog.value = false;
}

async function submitApply() {
  const payload = payloadDesired();

  if (!payload) {
    return;
  }

  applying.value = true;
  applyError.value = "";

  try {
    const result = await applyDiscordStructure({
      confirmName: applyForm.value.confirmName.trim(),
      desired: payload,
      allowAdministrator: applyForm.value.allowAdministrator,
      allowDangerous: applyForm.value.allowDangerous,
      allowDeletes: applyForm.value.allowDeletes,
    });

    applyDialog.value = false;
    notice.value =
      Number(result?.failed) > 0
        ? `적용 중 실패했어요(${result.failed}건): ${
            result.error || "원인 미상"
          }`
        : `적용 완료: 작업 ${result?.ok ?? 0}개를 반영했어요.`;

    await load();
    await loadRuns();
    subTab.value = "history";
  } catch (error) {
    applyError.value = error?.message || "적용하지 못했어요.";
  } finally {
    applying.value = false;
  }
}

// ── 이력 / 롤백 ─────────────────────────────────────────────────────────────

async function loadRuns() {
  runsError.value = "";

  try {
    const payload = await fetchDiscordApplyRuns({ limit: 20 });
    runs.value = payload?.runs || [];
  } catch (error) {
    runsError.value = error?.message || "적용 이력을 불러오지 못했어요.";
  }
}

async function toggleRun(runId) {
  if (openRunId.value === runId) {
    openRunId.value = "";
    openRun.value = null;

    return;
  }

  openRunId.value = runId;
  openRun.value = null;

  try {
    openRun.value = await fetchDiscordApplyRun(runId);
  } catch (error) {
    runsError.value = error?.message || "실행 상세를 불러오지 못했어요.";
    openRunId.value = "";
  }
}

function runStatusClass(status) {
  if (status === "SUCCEEDED") {
    return "ok";
  }

  if (status === "FAILED") {
    return "danger";
  }

  if (status === "ROLLED_BACK") {
    return "warn";
  }

  return "";
}

function openRollbackDialog(run) {
  rollbackTarget.value = run;
  rollbackForm.value = { confirmName: "" };
  rollbackError.value = "";
  rollbackDialog.value = true;
}

function closeRollbackDialog() {
  rollbackDialog.value = false;
  rollbackTarget.value = null;
}

async function submitRollback() {
  if (!rollbackTarget.value) {
    return;
  }

  rollingBack.value = true;
  rollbackError.value = "";

  try {
    const result = await rollbackDiscordApply(rollbackTarget.value.id, {
      confirmName: rollbackForm.value.confirmName.trim(),
    });

    rollbackDialog.value = false;
    notice.value =
      Number(result?.failed) > 0
        ? `롤백 중 실패했어요(${result.failed}건): ${
            result.error || "원인 미상"
          }`
        : `롤백 완료: 작업 ${result?.ok ?? 0}개를 되돌렸어요.`;

    await load();
    await loadRuns();
  } catch (error) {
    rollbackError.value = error?.message || "롤백하지 못했어요.";
  } finally {
    rollingBack.value = false;
  }
}

// ── 공통 ────────────────────────────────────────────────────────────────────

function beforeUnload(event) {
  if (!dirty.value) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
}

onMounted(async () => {
  window.addEventListener("beforeunload", beforeUnload);
  await load();
  await loadRuns();
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>

<style scoped lang="scss">
.struct-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.toolbar-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}
.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
}
.pill.ok {
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
}
.pill.warn {
  background: rgba(245, 158, 11, 0.18);
  color: #fcd34d;
}
.pill.danger {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}
.muted {
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
}
.subtab-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.subtab-button {
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.subtab-button.active {
  background: rgba(99, 102, 241, 0.24);
  color: #c7d2fe;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 10px;
}
.panel-head h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: #ffffff;
}
.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.55);
}
.hint.warn {
  color: #fcd34d;
}
.preset-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.preset-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  line-height: 1.55;
}
.preset-block strong {
  font-size: 13px;
  color: #ffffff;
}
.preset-block p {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
}
.preset-block p.muted {
  color: rgba(255, 255, 255, 0.5);
}
.row-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.category-card {
  background: rgba(99, 102, 241, 0.12);
}
.row-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.row-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.spacer {
  flex: 1;
}
.row-check {
  width: 16px;
  height: 16px;
  margin: 0;
  flex: 0 0 auto;
  accent-color: #818cf8;
  cursor: pointer;
}
.row-check-space {
  width: 16px;
  flex: 0 0 auto;
}
.check-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
}
.check-all input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #818cf8;
  cursor: pointer;
}
.color-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  flex: 0 0 auto;
}
.name-input {
  flex: 1;
  min-width: 160px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
}
.name-input:disabled {
  opacity: 0.6;
}
.tag {
  padding: 3px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
}
.tag.new {
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
}
.channel-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 8px;
}
.field-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.74);
}
.field-row > span:first-child {
  min-width: 72px;
  font-weight: 700;
}
.field-row input[type="text"],
.field-row input[type="number"],
.field-row select {
  min-width: 180px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 13px;
  font-family: inherit;
}
.field-row input:disabled,
.field-row select:disabled {
  opacity: 0.6;
}
.small-input {
  width: 96px;
  min-width: 0;
}
.field-row .small-input {
  min-width: 0;
  width: 96px;
}
.check-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.74);
  cursor: pointer;
}
.check-inline.warn {
  color: #fcd34d;
}
.perm-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.perm-head strong {
  font-size: 13px;
  color: #ffffff;
}
.search-input {
  height: 32px;
  min-width: 160px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  font-size: 12px;
}
.perm-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.24);
}
.perm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
  cursor: pointer;
}
.perm-item.danger {
  color: #fca5a5;
}
.perm-item.tri {
  justify-content: space-between;
  cursor: default;
}
.perm-name {
  margin-left: auto;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.32);
}
.tri-buttons {
  display: flex;
  gap: 4px;
}
.tri-button {
  padding: 3px 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.tri-button.active {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.3);
  color: #ffffff;
}
.overwrite-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}
.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip-toggle {
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.chip-toggle.selected {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.28);
  color: #ffffff;
}
.removed-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.12);
  font-size: 12px;
  color: #fca5a5;
}
.count-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.count-badge {
  padding: 5px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.78);
}
.count-badge.danger {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
}
.issue-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  font-size: 12px;
}
.issue-box ul {
  margin: 0;
  padding-left: 18px;
}
.issue-box.bad {
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}
.issue-box.warn {
  background: rgba(245, 158, 11, 0.14);
  color: #fcd34d;
}
.op-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.op-table th {
  padding: 8px;
  text-align: left;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}
.op-table td {
  padding: 8px;
  color: rgba(255, 255, 255, 0.82);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  vertical-align: top;
}
.op-table tr.destructive td {
  color: #fca5a5;
}
.error-cell {
  max-width: 320px;
  word-break: break-all;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}
.preset-button {
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.primary-button {
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.42);
  color: #ffffff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.danger-button {
  height: 34px;
  padding: 0 16px;
  border: none;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.24);
  color: #fca5a5;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.preset-button:disabled,
.primary-button:disabled,
.danger-button:disabled,
.link-button:disabled,
.chip-toggle:disabled,
.tri-button:disabled {
  opacity: 0.45;
  cursor: default;
}
.link-button {
  border: none;
  background: none;
  padding: 0 4px;
  color: #c7d2fe;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.link-button.danger {
  color: #fca5a5;
}
.empty-box {
  margin: 0;
  padding: 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}
.error-box {
  margin: 0;
  padding: 12px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.16);
  font-size: 12px;
  color: #fca5a5;
}
.notice-box {
  margin: 0;
  padding: 12px;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.16);
  font-size: 12px;
  color: #c7d2fe;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.64);
}
.modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(520px, 100%);
  max-height: 86vh;
  overflow-y: auto;
  padding: 20px;
  border-radius: 18px;
  background: #1f2937;
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.modal h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: #ffffff;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
