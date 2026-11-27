<template>
  <div class="shop-list-view">
    <header class="shop-header">
      <button type="button" class="back-button" @click="goHome">←</button>
      <div class="header-text">
        <p class="eyebrow">PRE-ORDER</p>
        <h1>전자담배 구매 예약</h1>
      </div>
      <router-link to="/reserve/lookup" class="lookup-link"
        >예약 조회</router-link
      >
    </header>

    <section class="notice-card">
      <p class="notice-title">매장 픽업 예약 안내</p>
      <ul class="notice-list">
        <li>온라인 결제는 받지 않아요. 매장에서 결제하고 바로 받아가요.</li>
        <li>만 19세 이상만 예약할 수 있고, 픽업할 때 신분증을 확인해요.</li>
        <li>예약한 시간에 오시면 대기 없이 바로 받을 수 있어요.</li>
      </ul>
    </section>

    <div v-if="isLoading" class="state-box">상품을 불러오는 중이에요.</div>

    <div v-else-if="errorMessage" class="state-box error">
      <p>{{ errorMessage }}</p>
      <button type="button" class="retry-button" @click="loadCatalog">
        다시 시도
      </button>
    </div>

    <template v-else>
      <div v-if="categories.length" class="category-row">
        <button
          type="button"
          class="category-chip"
          :class="{ active: !selectedCategoryId }"
          @click="selectCategory('')"
        >
          전체
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          class="category-chip"
          :class="{ active: selectedCategoryId === category.id }"
          @click="selectCategory(category.id)"
        >
          {{ category.name }}
        </button>
      </div>

      <div v-if="!filteredProducts.length" class="state-box">
        예약할 수 있는 상품이 아직 없어요.
      </div>

      <ul v-else class="product-list">
        <li v-for="product in filteredProducts" :key="product.id">
          <router-link
            :to="`/shop/${product.id}`"
            class="product-card"
            :class="{ soldout: isSoldOut(product) }"
          >
            <div class="thumb">
              <img
                v-if="product.imageUrl"
                :src="product.imageUrl"
                :alt="product.name"
              />
              <span v-else class="thumb-fallback">🛍️</span>
            </div>

            <div class="product-body">
              <p v-if="product.brand" class="brand">{{ product.brand }}</p>
              <p class="name">{{ product.name }}</p>

              <div class="tags">
                <span v-if="product.flavorProfile" class="tag">{{
                  product.flavorProfile
                }}</span>
                <span v-if="product.nicotineType" class="tag">{{
                  product.nicotineType
                }}</span>
                <span v-if="product.isNicotineFree" class="tag highlight"
                  >무니코틴</span
                >
                <span v-if="isSoldOut(product)" class="tag danger"
                  >예약마감</span
                >
                <span v-else-if="isLowStock(product)" class="tag warn">
                  {{ product.availableStock }}개 남음
                </span>
              </div>

              <p class="price">{{ formatShopWon(product.price) }}</p>
            </div>
          </router-link>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { fetchShopCatalog, formatShopWon } from "@/lib/shop";

const router = useRouter();

const categories = ref([]);
const products = ref([]);
const selectedCategoryId = ref("");
const isLoading = ref(false);
const errorMessage = ref("");

const filteredProducts = computed(() =>
  selectedCategoryId.value
    ? products.value.filter(
        (product) => product.categoryId === selectedCategoryId.value
      )
    : products.value
);

function isSoldOut(product) {
  return product.isSoldOut === true || Number(product.availableStock ?? 0) <= 0;
}

function isLowStock(product) {
  const available = Number(product.availableStock ?? 0);

  return available > 0 && available <= 3;
}

function selectCategory(categoryId) {
  selectedCategoryId.value = categoryId;
}

function goHome() {
  router.push("/");
}

async function loadCatalog() {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const data = await fetchShopCatalog();

    categories.value = data.categories;
    products.value = data.products;
  } catch (error) {
    errorMessage.value = error?.message || "상품을 불러오지 못했어요.";
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadCatalog);
</script>

<style scoped lang="scss">
.shop-list-view {
  min-height: 100vh;
  padding: 20px 16px 48px;
  background: linear-gradient(180deg, #0f172a 0%, #111827 100%);
  color: #ffffff;
}

.shop-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.back-button {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}

.header-text {
  flex: 1;
  min-width: 0;
}

.eyebrow {
  margin: 0 0 2px;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.45);
}

h1 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
}

.lookup-link {
  flex-shrink: 0;
  padding: 7px 10px;
  border-radius: 9px;
  border: 1px solid rgba(96, 165, 250, 0.4);
  color: #93c5fd;
  font-size: 12px;
  text-decoration: none;
}

.notice-card {
  margin-bottom: 18px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(96, 165, 250, 0.1);
  border: 1px solid rgba(96, 165, 250, 0.22);
}

.notice-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: #bfdbfe;
}

.notice-list {
  margin: 0;
  padding-left: 16px;
  display: grid;
  gap: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.72);
}

.category-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.category-chip {
  flex-shrink: 0;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;

  &.active {
    border-color: rgba(96, 165, 250, 0.6);
    background: rgba(96, 165, 250, 0.2);
    color: #fff;
  }
}

.state-box {
  padding: 28px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);

  &.error {
    color: #fca5a5;
  }
}

.retry-button {
  margin-top: 12px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.product-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.product-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  text-decoration: none;
  color: inherit;

  &.soldout {
    opacity: 0.55;
  }
}

.thumb {
  width: 68px;
  height: 68px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.thumb-fallback {
  font-size: 26px;
}

.product-body {
  flex: 1;
  min-width: 0;
}

.brand {
  margin: 0 0 2px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.5);
}

.name {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.tag {
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);

  &.highlight {
    background: rgba(34, 197, 94, 0.16);
    color: #86efac;
  }

  &.warn {
    background: rgba(251, 191, 36, 0.16);
    color: #fcd34d;
  }

  &.danger {
    background: rgba(248, 113, 113, 0.16);
    color: #fca5a5;
  }
}

.price {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #93c5fd;
}
</style>
